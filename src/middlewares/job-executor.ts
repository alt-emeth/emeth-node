import axios from 'axios'
import delay from 'delay'
import fs from 'fs'
import interval from 'interval-promise'
import { Logger } from 'log4js'
import makeDir from 'make-dir'
import os from 'os'
import path from 'path'
import portfinder from 'portfinder'
import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { MODE } from '../lib/consistants'
import { execSplitter, launchMasterNode } from '../lib/parallel-gpt'
import { getS3, putS3 } from '../lib/storage'
import { Job, JobStatus, Masterport, Worker } from '../types/tables'
import { WalletMiddlewareArguments } from './wallet'
import { collectCandidateWorkerInfo, findAvailableWorkers, killWorkers, uploadFileToWorker } from '../lib/workers'
import { Emeth } from '../types/contracts'
import { ethers } from 'ethers'
import { Knex } from 'knex'

const randomPort = async(trx:Knex.Transaction, exclude:number[] = []):Promise<number> => {
  if(exclude.length == 0) {
    const rows = await trx.from('masterports')

    for (const row of rows) {
      exclude.push(row.port)
    }
  }

  const rand = Math.floor(Math.random() * (65535 - 8000 + 1) + 8000)

  if(exclude.includes(rand)) {
    return randomPort(trx, exclude)
  }

  return rand;
}

export const jobExecute = async(
  jobId:string, 
  emeth:Emeth, 
  wallet: ethers.Wallet,
  db: Knex,
  logger: Logger,
  parallelGPTPath: string,
  storageApi: string,
  myIp:string,
  batchSize:number,
  device:string,
  n_epochs:number,
  usedWorkers:Worker[]) => {

  let masterPort:number = 0

  try {
    const job = await emeth.jobs(jobId)
    const jobAssign = await emeth.jobAssigns(jobId)

    logger.info(`JobId:${job.jobId}, job process start`)
    logger.info(`JobId:${job.jobId}, usedWorkers:${JSON.stringify(usedWorkers)}`)
    const jobDetail = await emeth.jobDetails(job.jobId)
    logger.info(`JobId:${job.jobId}, job detail:${JSON.stringify(jobDetail)}`)

    for (const worker of usedWorkers) {
      await axios.post(`http://${worker.ipAddress}:3000/api/v1/waitData`)
    }

    const trainDataDir = path.join(parallelGPTPath, 'data', jobId)
    const splitDataDir = path.join(parallelGPTPath, 'split', jobId)
    const outputDir = path.join(parallelGPTPath, 'model', jobId)
    const workerIpListDir = path.join(parallelGPTPath, 'worker_ip_list')
    const datasetCacheDir = path.join(parallelGPTPath, 'dataset_cache')
    await makeDir(trainDataDir)
    await makeDir(splitDataDir)
    await makeDir(outputDir)
    await makeDir(workerIpListDir)
    await makeDir(datasetCacheDir)
    const trainDataFile = path.join(trainDataDir, jobDetail.dataset)
    const workerIpListFile = path.join(workerIpListDir, `${job.jobId}.txt`)
    const datasetCache = path.join(datasetCacheDir, jobId)

    const trx = await db.transaction()

    const sqliteJob = await trx('jobs').where({ jobId }).first()
    if(sqliteJob != null) {
      await trx('jobs').where({ jobId }).update({
        status: JobStatus.PROCESSING,
        numOfAttempt: db.raw('numOfAttempt + 1'),
        updatedAt: new Date().getTime()
      })

    }

    masterPort = await randomPort(trx)

    await trx('masterports').insert({
      port: masterPort,
      jobId
    })

    if (job.status.toNumber() === JobStatus.ASSIGNED) {
      await emeth.process(job.jobId)
    }

    await trx.commit()

    await getS3(storageApi, wallet, job.jobId, trainDataFile)

    await execSplitter(trainDataFile, splitDataDir + '/', usedWorkers.length, {
      logger,
      parallelGPTPath
    })

    const testDataFile = path.join(splitDataDir, 'valid.txt')
    let index = 0
    for (const worker of usedWorkers) {
      // send data to worker
      index++

      const workerDataFile = path.join(splitDataDir, `train${index}.txt`)

      await uploadFileToWorker(workerDataFile, worker, jobId)
      await uploadFileToWorker(testDataFile, worker, jobId)

      // ready worker
      const json = {
        train_data_file: `train${index}.txt`,
        test_data_file: 'valid.txt',
        master_port: masterPort,
        jobId,
        batchSize,
        n_epochs,
        num_workers: usedWorkers.length,
        rank: index
      }

      await axios.post(`http://${worker.ipAddress}:3000/api/v1/ready`, json)

      // waiting for idle
      await delay(10000)

      const modeRes = (await axios.get(`http://${worker.ipAddress}:3000/api/v1/mode`)).data
      if (modeRes.result !== MODE.Idle) {
        throw new Error(`JobId:${jobId}, Timeout worker process:${worker.ipAddress}`)
      }

      fs.writeFileSync(workerIpListFile, usedWorkers.map(worker => worker.ipAddress).join(os.EOL))
    }

    const masterNode = await launchMasterNode(
      jobId,
      trainDataFile,
      outputDir + '/',
      workerIpListFile,
      masterPort,
      myIp as string,
      jobAssign.timeLimit.toNumber(),
      testDataFile,
      batchSize as number,
      device as string,
      n_epochs as number,
      datasetCache as string,
      usedWorkers.length,
      {
        logger,
        parallelGPTPath
      })

    masterNode.on('completed', async (fileName) => {
      (async () => {
        logger.info(`JobId:${job.jobId}, Start file upload. ${fileName}`)
        const result = await putS3(storageApi, wallet, job.jobId, fileName, logger)
        logger.info(`JobId:${job.jobId}, File upload completed.`)

        let counter = 0;

        while(true) {
          let completed = false

          counter++

          logger.info(`JobId:${job.jobId}, Start submit process: ${result}, Tried count: ${counter}`)

          emeth.submit(job.jobId, result).then(async(tx) => {
            logger.info(`JobId:${job.jobId}, Submit Transaction issuance completed. hash: ${tx.blockHash}`)

            const receipt = await tx.wait(1)

            logger.info(`JobId:${job.jobId}, Submit Transaction completed. receipt:${JSON.stringify(receipt)}`)

            const trx = await db.transaction()

            const sqliteJob = await trx('jobs').where({ jobId }).first()
            if(sqliteJob != null) {
              await trx('jobs').where({ jobId }).update({
                status: JobStatus.SUBMITTED,
                updatedAt: new Date().getTime()
              })
            } 

            const port = await trx('masterports').where({ port: masterPort}).first()
            if(port != null) {
              await trx('masterports').where({ port:masterPort }).delete()
            }

            await trx.commit()

            logger.info(`JobId:${job.jobId}, Completed submit process: ${result}`);

            completed = true
          })

          await delay(1000 * 60)

          if(completed) {
            break
          }

          if(counter >= 10) {
            throw new Error(`JobId:${job.jobId}, The trial of submit process limit over.`)
          }
        }

        logger.info(`JobId:${job.jobId}, job process end. fileName:${fileName}`)
      })().catch(console.log)
    })

    masterNode.on('error', async (err) => {
      console.log(err.message)
      console.log(`Job was interrupted due to an unexpected error. jobId:${job.jobId}`)

      await killWorkers(usedWorkers)

      const trx = await db.transaction()
      const port = await trx('masterports').where({ port: masterPort}).first()
      if(port != null) {
        await trx('masterports').where({ port:masterPort }).delete()
      }
      await trx.commit()

    })
  } catch (e) {
    console.log(e.message)
    await killWorkers(usedWorkers)

    const trx = await db.transaction()
    const port = await trx('masterports').where({ port: masterPort}).first()
    if(port != null) {
      await trx('masterports').where({ port:masterPort }).delete()
    }
    await trx.commit()

  }
}

export default function jobExecutor (args: Arguments): void {
  const logger = args.logger as Logger
  const parallelGPTPath = args.parallelGPTPath as string
  const storageApi = args.storageApi as string

  const contracts = (args as unknown as ContractsMiddlewareArguments).contracts
  const wallet = (args as unknown as WalletMiddlewareArguments).wallet
  const db = (args as unknown as DatabaseMiddlewareArguments).db

  logger.info(`Start interval job execution.`)
  interval(async () => {
    const job = await db('jobs').where('status', JobStatus.ASSIGNED).andWhere('assignedNode', wallet.address).orderBy('createdAt').first()
    if (job === undefined) {
      return
    }

    const jobId = job.jobId

    try {
      const jobIdBytes = Buffer.from(jobId.slice(2), 'hex')

      const job = await contracts.emeth.jobs(jobIdBytes)
      const jobAssign = await contracts.emeth.jobAssigns(jobIdBytes)

      logger.info(`JobId:${jobId}, job exist:${String(job.exist)}, job status:${String(job.status)}`)

      logger.info(`JobId:${jobId}, assigned node:${jobAssign.node}, my address:${wallet.address}`)
      if (jobAssign.node !== wallet.address || job.status.toNumber() !== JobStatus.ASSIGNED) {
        const trx = await db.transaction()

        const sqliteJob = await trx('jobs').where({ jobId }).first()
        if(sqliteJob != null) {
          await trx('jobs').where({ jobId }).update({
            status: job.status.toNumber(),
            assignedNode: jobAssign.node,
            updatedAt: new Date().getTime()
          })
        }

        await trx.commit()

        throw new Error(`JobId:${jobId}, This is not assigned or not assigned status. updated queued job.`)
      }

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

      await jobExecute(
        jobId,
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
        candidateWorkers)

    } catch (e) {
      console.log(e)
    }
  }, 1000, {
    stopOnError: false
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}
