import { Job, JobStatus, Worker } from '../types/tables'
import delay from 'delay'
import readline from 'readline';
import { Emeth } from '../types/contracts'
import { ethers } from 'ethers'
import { Knex } from 'knex'
import fs from 'fs'
import { Logger } from 'log4js'
import path from 'path'
import axios from 'axios'
import { getS3, putS3 } from '../lib/storage'
import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { WalletMiddlewareArguments } from './wallet'
import { collectCandidateWorkerInfo, findAvailableWorkers } from '../lib/workers'
import { jobExecute } from './job-executor';
import { Arguments } from 'yargs'

const extractCompletedJson = (log_file:string) => {
  return new Promise((resolve, reject) => {
    let res:any = null;
    const rs = fs.createReadStream(log_file);
    const rl = readline.createInterface({
      input: rs,
      output: process.stdout,
      terminal: false,
    });
    rl.on('line', (line) => {
      line = line.replace(/\r?\n/g, '');
      let json = null;
      try {
        json = JSON.parse(line);
      } catch (e) {}
      if (json && json.status == 'COMPLETED') {
        res = json;
      }
    })
    rl.on('close', () => {
      resolve(res);
    })
  });
}

const checkRecoverJob = async(
  emeth:Emeth, 
  wallet:ethers.Wallet, 
  parallelGPTPath: string, 
  db:Knex,
  logger:Logger):Promise<Array<{jobId:string|null, needProcess:boolean, needSubmit:boolean, fileName:string|null}>> => {

  const recoverJobs = [] as Array<{jobId:string|null, needProcess:boolean, needSubmit:boolean, fileName:string|null}>

  const sqliteJobs = await db.from('jobs')

  for(let i=0; i<sqliteJobs.length; i++) {
    const jobId = sqliteJobs[i].jobId

    const job = await emeth.jobs(jobId)

    logger.info(`assigned job:${JSON.stringify(job)}`)

    if(!job.status.eq(JobStatus.PROCESSING)) {
      logger.info(`JobId:${job.jobId}, This is not processing. status:${job.status}`)
      continue
    }

    const jobAssign = await emeth.jobAssigns(jobId);
    logger.info(`Assigned node:${jobAssign.node}, my address:${wallet.address}`)
  
    if(jobAssign.node != wallet.address) {
      logger.info(`JobId:${job.jobId}, This is not assigned to me`)
      continue
    }

    logger.info(`JobId:${job.jobId}, This is a suspended job. Need recovor`)
  
    const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)
  
    if(!fs.existsSync(logFile)) {
      logger.info(`JobId:${job.jobId}, log file is not exist. Need retry process. ${logFile}`)

      recoverJobs.push({jobId, needProcess:true, needSubmit: false, fileName:null})

      continue
    }
  
    const json:any = await extractCompletedJson(logFile)
  
    if(!json) {
      logger.info(`JobId:${job.jobId}, Learning is not completed yet. Need retry process`)
      recoverJobs.push({jobId, needProcess:true, needSubmit: false, fileName:null})

      continue
    }
  
    logger.info(`JobId:${job.jobId}, Learning is completed. Need retry submit.`)

    recoverJobs.push({jobId, needProcess:false, needSubmit: true, fileName:json.fileName})
  }

  return recoverJobs
}

const retrySubmit = async(
  jobId:string,
  fileName:string,
  emeth:Emeth, 
  wallet:ethers.Wallet, 
  db:Knex, 
  storageApi: string, 
  logger:Logger) => {

  const job = await emeth.jobs(jobId)
  const jobAssign = await emeth.jobAssigns(jobId)

  let uploadedFile = `${jobId}-${wallet.address.toLowerCase()}${path.extname(fileName)}`
  logger.info(`JobId:${job.jobId}, check uploaded:${uploadedFile}`)

  let uploadedSize = 0
  try {
    uploadedSize = (await axios.get(`http://${storageApi}:3000/api/v1/sizeOf?key=result/${uploadedFile}`)).data.result
  } catch (e) {
    console.log(e)
  }
  const savedSize = fs.statSync(fileName).size
  logger.info(`JobId:${job.jobId}, Saved file size:${savedSize}, Uploaded file size:${uploadedSize}`)

  if(savedSize !== Number(uploadedSize)) {
    logger.info(`JobId:${job.jobId}, File upload incomplete. Try upload again:${fileName}`)
    uploadedFile = await putS3(storageApi, wallet, jobId, fileName, logger)
  } else {
    logger.info(`JobId:${job.jobId}, File upload already completed. ${fileName}`)
  }

  logger.info(`JobId:${job.jobId}, Retry submit: ${uploadedFile}`)
  await emeth.submit(job.jobId, uploadedFile)
  logger.info(`JobId:${job.jobId}, Completed submit: ${uploadedFile}`)

  const trx = await db.transaction()

  const sqliteJob = await trx('jobs').where({ jobId }).first()
  if(sqliteJob != null) {
    await trx('jobs').where({ jobId }).update({
      status: JobStatus.SUBMITTED,
      updatedAt: new Date().getTime(),
      numOfAttempt: db.raw('numOfAttempt + 1'),
    })

    logger.info(`JobId:${job.jobId}, Updated queued job`)
  } else {
    await trx('jobs').insert({
      jobId: jobId,
      assignedNode: jobAssign.node,
      status: JobStatus.SUBMITTED,
      numOfAttempt: 0,
      createdAt: new Date().getTime(),
      updatedAt: new Date().getTime()
    })

    logger.info(`JobId:${job.jobId}, Queued job as submitted data`)
  }

  await trx.commit()

  logger.info(`JobId:${job.jobId}, Retry submit is completed. fileName:${fileName}`)
}

export default async function recover (args: Arguments): Promise<void> {
  const logger = args.logger as Logger
  const parallelGPTPath = args.parallelGPTPath as string
  const storageApi = args.storageApi as string

  const contracts = (args as unknown as ContractsMiddlewareArguments).contracts
  const wallet = (args as unknown as WalletMiddlewareArguments).wallet
  const db = (args as unknown as DatabaseMiddlewareArguments).db

  logger.info(`Start recovery job process.`)
  const recoverJobs = await checkRecoverJob(contracts.emeth, wallet, parallelGPTPath, db, logger)
  
  for(const recoverJob of recoverJobs) {
    const needProcess = recoverJob.needProcess
    const needSubmit = recoverJob.needSubmit
    const jobId = recoverJob.jobId
    const fileName = recoverJob.fileName

    if(needProcess) {
      logger.info(`JobId:${jobId}, Start retrying process.`)
  
      let usedWorkers:Worker[] = [];
  
      const jobAssign = await contracts.emeth.jobAssigns(jobId as string)
  
      // waiting for all needed workers are available.
      while(true) {
        try {
          const availableWorkers = await findAvailableWorkers(db)
    
          const {
            requiredPowerCapacity, havingPowerCapacity,
            candidateWorkerPowerCapacity, candidateWorkers
          } = collectCandidateWorkerInfo(availableWorkers, jobAssign)
      
          logger.info(`JobId:${jobId},
          requredPowerCapacity:${requiredPowerCapacity.toString()},
          havingPowerCapacity:${havingPowerCapacity.toString()},
          candidateWorkerPowerCapacity:${candidateWorkerPowerCapacity.toString()},
          candidateWorkers:${candidateWorkers.toString()}`
          )
          if (candidateWorkerPowerCapacity < requiredPowerCapacity) {
            throw new Error(`JobId:${jobId}, Power capacity is not enoguh.`)
          }
          if (candidateWorkers.length === 0) {
            throw new Error(`JobId:${jobId}, candidateWorkers is zero even Power capacity is enoguh`)
          }
          usedWorkers = candidateWorkers
          break
        } catch (e) {
          console.log(e)
        }
        await delay(1000)
      }
  
      await jobExecute(
        jobId as string,
        contracts.emeth,
        wallet,
        db,
        logger,
        parallelGPTPath,
        storageApi,
        args.myIp as string,
        args.batchSize as number,
        args.device as string,
        args.n_epochs as number,
        usedWorkers)
    } else if(needSubmit) {
      logger.info(`JobId:${jobId}, Start retrying submit.`)
  
      await retrySubmit(
        jobId as string, 
        fileName as string,
        contracts.emeth,
        wallet,
        db,
        storageApi,
        logger)
    }
  }

  logger.info(`End recovery job process.`)
}