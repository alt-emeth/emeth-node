import { Wallet } from "@ethersproject/wallet"
import axios from "axios"
import delay from "delay"
import { Knex } from "knex"
import { Logger } from "log4js"
import path from "path"
import { sign } from "../lib/crypto"
import { execSplitter, generateArgFiles, launchMasterNode, randomPort } from "../lib/parallel-gpt"
import { getS3, putS3 } from "../lib/storage"
import { killWorkers, processWorker } from "../lib/workers"
import { ProcessHolder } from "../middlewares/exit-handler"
import { IAuth } from "../types/api"
import { Emeth, EmethToken } from "../types/contracts"
import { ContributionStatus, JobStatus, Worker } from "../types/tables"
import fs from 'fs'

export async function submit(
  logger:Logger,
  jobId:string,
  result:string,
  emeth:Emeth,
  db:Knex
) {

  let counter = 0;

  while(true) {
    let completed = false

    counter++

    logger.info(`JobId:${jobId}, Start submit process: ${result}, Tried count: ${counter}`)

    emeth.submit(jobId, result).then(async(tx) => {
      logger.info(`JobId:${jobId}, Submit Transaction issuance completed. hash: ${tx.blockHash}`)

      const receipt = await tx.wait(1)

      logger.info(`JobId:${jobId}, Submit Transaction completed. receipt:${JSON.stringify(receipt)}`)

      logger.info(`JobId:${jobId}, Completed submit process: ${result}`);

      completed = true
    })

    await delay(1000 * 60)

    if(completed) {
      break
    }

    if(counter >= 10) {
      throw new Error(`JobId:${jobId}, The trial of submit process limit over.`)
    }
  }
}

export async function process(
  job:ReturnType<Emeth['jobs']> extends Promise<infer T> ? T : never,
  timeLimit:number,
  logger:Logger,
  emeth:Emeth,
  emethToken:EmethToken,
  db:Knex,
  parallelGPTPath:string,
  storageApi:string,
  wallet:Wallet,
  batchSize:number,
  n_epochs:number,
  device:string,
  my_url:string,
  processHolder: ProcessHolder,
  usedWorkers: Worker[]
) {
  const jobId = job.jobId
  let masterPort:number = 0
  let trx:Knex.Transaction|null = null

  try {
    logger.info(`JobId:${job.jobId}, job process start`)

    logger.info(`JobId:${jobId}, usedWorkers:${JSON.stringify(usedWorkers)}`)
    const jobDetail = await emeth.jobDetails(jobId)
    logger.info(`JobId:${jobId}, job detail:${JSON.stringify(jobDetail)}`)
  
    for (const worker of usedWorkers) {
      const timestamp = new Date().getTime()
      const sig = await sign(['uint256'], [timestamp], wallet)
  
      await axios.post(`${worker.url}/api/v1/waitData`, {
        auth: {
          sig, 
          timestamp
        } as IAuth
      })
    }
  
    const {outputDir, splitDataDir, trainDataFile, workerIpListFile, datasetCache} 
      = await generateArgFiles(parallelGPTPath, jobId, jobDetail)

    masterPort = await randomPort(processHolder)

    if(job.status.eq(JobStatus.REQUESTED)) {
      const rate = await emeth.DEPOSIT_RATE()
      const deposit = job.fee.mul(rate).div(100000)
      await (await emethToken.approve(emeth.address, deposit)).wait(1)

      await (await emeth.process(jobId)).wait(1)
    }
  
    await getS3(storageApi, wallet, jobId, trainDataFile)
  
    await execSplitter(trainDataFile, splitDataDir + '/', usedWorkers.length, {
      logger,
      parallelGPTPath
    })
  
    const testDataFile = path.join(splitDataDir, 'valid.txt')
  
    await processWorker(
      usedWorkers, 
      splitDataDir, 
      testDataFile, 
      jobId, 
      masterPort, 
      batchSize as number,
      n_epochs as number,
      timeLimit,
      workerIpListFile,
      wallet
      )

    const {masterNode, child} = await launchMasterNode(
      jobId,
      trainDataFile,
      outputDir + '/',
      workerIpListFile,
      masterPort,
      my_url as string,
      timeLimit,
      testDataFile,
      batchSize as number,
      device as string,
      n_epochs as number,
      datasetCache as string,
      usedWorkers,
      logger,
      parallelGPTPath)
  
    processHolder.register(jobId, child, usedWorkers, masterPort)

    masterNode.on('completed', async (fileName) => {
      logger.info(`JobId:${job.jobId}, Start file upload. ${fileName}`)
      const result = await putS3(storageApi, wallet, job.jobId, fileName, logger)
      logger.info(`JobId:${job.jobId}, File upload completed.`)
  
      await submit(logger, jobId, result, emeth, db)

      const trx = await db.transaction()

      try {
        const sqliteJob = await trx('jobs').where('job_id', jobId).first()

        for(const worker of usedWorkers) {
          await trx('contributions').update({
            contribution: 100000,
            ended_at: new Date().getTime()
          }).where('job_id', jobId).andWhere('num_attempt', sqliteJob?.num_attempt).andWhere('worker_address', worker.address)
        }
  
        await trx.commit()
      } catch (e) {
        await trx.rollback()
        logger.error(e)
      }

      processHolder.unregister(jobId)

      logger.info(`JobId:${job.jobId}, job process end. fileName:${fileName}`)
    })
  
    masterNode.on('error', async (err) => {
      logger.error(err.message)

      processHolder.unregister(jobId)
    })

    masterNode.on('suspend', async(jobId, err) => {
      logger.error(err)

      processHolder.unregister(jobId)

      const trx = await db.transaction()
      try {
        const job = await trx('jobs').where('job_id', jobId).first()

        await trx('contributions').update({
          status: ContributionStatus.DISCONNECTED
        }).where('job_id', jobId).andWhere('num_attempt', job?.num_attempt)
  
        await trx.commit()
      } catch (e) {
        await trx.rollback()
        logger.error(e)
      }
    })

    const size = fs.statSync(trainDataFile).size  / (1024*1024)

    trx = await db.transaction()

    const sqliteJob = await trx('jobs').where('job_id', jobId).first()
    if(sqliteJob) {
      await trx('jobs').update({
        num_attempt: sqliteJob.num_attempt + 1,
        data_size_mb: size,
        program_id: jobDetail.programId.toNumber()
      }).where('job_id', jobId)
    } else {
      await trx('jobs').insert({
        job_id: jobId,
        num_attempt: 1,
        data_size_mb: size,
        status: job.status.toNumber(),
        program_id: jobDetail.programId.toNumber()
      })
    }

    const updatedJob = await trx('jobs').where('job_id', jobId).first()

    for(const worker of usedWorkers) {
      const jobWorker = await trx('contributions').where('job_id', jobId).andWhere('num_attempt', updatedJob?.num_attempt).andWhere('worker_address', worker.address).first()
      if(!jobWorker) {
        await trx('contributions').insert({
          job_id: jobId,
          num_attempt: updatedJob?.num_attempt,
          worker_address: worker.address,
          master_address: wallet.address,
          started_at: new Date().getTime(),
          contribution: 0,
          status: ContributionStatus.NONE
        })
      }
    }

    await trx.commit()

  } catch (e) {
    logger.error(e.message)

    if(trx) {
      await trx.rollback()
    }

    await killWorkers(usedWorkers, wallet)

    processHolder.unregister(jobId)
  }
}