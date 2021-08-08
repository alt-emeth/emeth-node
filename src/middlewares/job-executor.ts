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
import { Job, JobStatus, Worker } from '../types/tables'
import { WalletMiddlewareArguments } from './wallet'
import { collectCandidateWorkerInfo, findAvailableWorkers, killWorkers, uploadFileToWorker } from '../lib/workers'
import readline from 'readline';
import { Emeth } from '../types/contracts'
import { ethers, logger } from 'ethers'
import { Knex } from 'knex'

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
  logger:Logger):Promise<{jobId:string|null, needProcess:boolean, needSubmit:boolean, fileName:string|null}> => {
    logger.info("Check recover job")

    const jobId = await emeth.lastJobAssigned(wallet.address)
  
    if(Number(jobId) == 0) {
      logger.info("There are not assigned job")
      return {jobId:null, needProcess:false, needSubmit:false, fileName:null}
    }
  
    const job = await emeth.jobs(jobId)
    logger.info(`Last assigned job:${JSON.stringify(job)}`)
  
    if(!job.status.eq(JobStatus.PROCESSING)) {
      logger.info(`JobId:${job.jobId}, This is not processing. status:${job.status}`)
      return {jobId:null, needProcess:false, needSubmit:false, fileName: null}
    }
    const jobAssign = await emeth.jobAssigns(jobId);
    logger.info(`Assigned node:${jobAssign.node}, my address:${wallet.address}`)
  
    if(jobAssign.node != wallet.address) {
      logger.info(`JobId:${job.jobId}, This is not assigned to me`)
      return {jobId:null, needProcess:false, needSubmit:false, fileName: null}
    }
  
    logger.info(`JobId:${job.jobId}, This is a suspended job. Need recovor`)
  
    const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)
  
    if(!fs.existsSync(logFile)) {
      logger.info(`JobId:${job.jobId}, log file is not exist. Need retry process. ${logFile}`)
      return {jobId, needProcess:true, needSubmit:false, fileName:null}
    }
  
    const json:any = await extractCompletedJson(logFile)
  
    if(!json) {
      logger.info(`JobId:${job.jobId}, Learning is not completed yet. Need retry process`)
      return {jobId, needProcess:true, needSubmit: false, fileName:null}
    }
  
    logger.info(`JobId:${job.jobId}, Learning is completed. Need retry submit.`)
    return {jobId, needProcess:false, needSubmit:true, fileName:json.fileName}
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

  const sqliteJob = await db('jobs').where({ jobId }).first()
  if(sqliteJob != null) {
    await db('jobs').where({ jobId }).update({
      status: JobStatus.SUBMITTED,
      updatedAt: new Date().getTime(),
      numOfAttempt: db.raw('numOfAttempt + 1'),
    })

    logger.info(`JobId:${job.jobId}, Updated locally data`)
  } else {
    await db('jobs').insert({
      jobId: jobId,
      assignedNode: jobAssign.node,
      status: JobStatus.SUBMITTED,
      numOfAttempt: 0,
      createdAt: new Date().getTime(),
      updatedAt: new Date().getTime()
    })

    logger.info(`JobId:${job.jobId}, Inserted locally data as submitted data`)
  }

  logger.info(`JobId:${job.jobId}, Retry submit is completed. fileName:${fileName}`)
}

const jobExecute = async(
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

  try {
    const job = await emeth.jobs(jobId)
    const jobAssign = await emeth.jobAssigns(jobId)

    console.log(`JobId:${job.jobId}, job process start`)
    console.log(`JobId:${job.jobId}, usedWorkers:${JSON.stringify(usedWorkers)}`)
    const jobDetail = await emeth.jobDetails(job.jobId)
    console.log(`JobId:${job.jobId}, job detail:${JSON.stringify(jobDetail)}`)

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
    const masterPort = await portfinder.getPortPromise({
      startPort: Math.random() * (65535 - 8000 + 1) + 8000,
      stopPort: 65535
    })

    if(await db('jobs').where({ jobId }).first() != null) {
      await db('jobs').where({ jobId }).update({
        status: JobStatus.PROCESSING,
        numOfAttempt: db.raw('numOfAttempt + 1'),
        updatedAt: new Date().getTime()
      })

    } else {
      await db('jobs').insert({
        jobId: jobId,
        assignedNode: jobAssign.node,
        status: JobStatus.PROCESSING,
        numOfAttempt: 1,
        createdAt: new Date().getTime(),
        updatedAt: new Date().getTime()
      })

      logger.info(`JobId:${job.jobId}, Inserted locally data as processing data`)
    }

    if (job.status.toNumber() === JobStatus.ASSIGNED) {
      await emeth.process(job.jobId)
    }

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
        jobId
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
      {
        logger,
        parallelGPTPath
      })

    masterNode.on('completed', async (fileName) => {
      (async () => {
        const result = await putS3(storageApi, wallet, job.jobId, fileName, logger)
        logger.info(`JobId:${job.jobId}, Start submit: ${result}`);
        await emeth.submit(job.jobId, result)
        logger.info(`JobId:${job.jobId}, Completed submit: ${result}`);
        await db('jobs').where({ jobId }).update({
          status: JobStatus.SUBMITTED,
          updatedAt: new Date().getTime()
        })

        console.log(`JobId:${job.jobId}, job process end. fileName:${fileName}`)
      })().catch(console.log)
    })

    masterNode.on('error', async (err) => {
      console.log(err.message)
      console.log(`Job was interrupted due to an unexpected error. jobId:${job.jobId}`)

      await killWorkers(usedWorkers)
    })
  } catch (e) {
    console.log(e.message)
    await killWorkers(usedWorkers)
  }
}

export default function jobExecutor (args: Arguments): void {
  (async() => {
    const logger = args.logger as Logger
    const parallelGPTPath = args.parallelGPTPath as string
    const storageApi = args.storageApi as string
  
    const contracts = (args as unknown as ContractsMiddlewareArguments).contracts
    const wallet = (args as unknown as WalletMiddlewareArguments).wallet
    const db = (args as unknown as DatabaseMiddlewareArguments).db
  
    logger.info(`Start recovery job process.`)
    const {jobId, needProcess, needSubmit, fileName} = await checkRecoverJob(contracts.emeth, wallet, parallelGPTPath, logger)
    
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
      
          console.log(`JobId:${jobId},
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
  
    logger.info(`End recovery job process.`)

    logger.info(`Start main job process.`)
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
  
        console.log(`JobId:${jobId}, job exist:${String(job.exist)}, job status:${String(job.status)}`)
  
        console.log(`JobId:${jobId}, assigned node:${jobAssign.node}, my address:${wallet.address}`)
        if (jobAssign.node !== wallet.address) {
          await db('jobs').where({ jobId }).update({
            assignedNode: jobAssign.node,
            updatedAt: new Date().getTime()
          })
          throw new Error(`JobId:${jobId}, This is not assigned`)
        }
  
        if (job.status.toNumber() === JobStatus.REQUESTED || job.status.toNumber() === JobStatus.FAILED) {
          await db('jobs').where({ jobId }).update({
            status: job.status.toNumber(),
            updatedAt: new Date().getTime()
          })
  
          const message = (job.status.toNumber() === JobStatus.REQUESTED) ? 'job returned to request' : 'job failed'
          throw new Error(`JobId:${jobId}, ${message} due to timeout. updated localy caching data.`)
        }
  
        if (job.status.toNumber() !== JobStatus.ASSIGNED) {
          await db('jobs').where({ jobId }).update({
            status: job.status.toNumber(),
            updatedAt: new Date().getTime()
          })
  
          throw new Error(`JobId:${jobId}, This is not assign status. updated localy caching data.`)
        }
  
        const availableWorkers = await findAvailableWorkers(db)
  
        const {
          requiredPowerCapacity, havingPowerCapacity,
          candidateWorkerPowerCapacity, candidateWorkers
        } = collectCandidateWorkerInfo(availableWorkers, jobAssign)
    
        console.log(`JobId:${jobId},
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
  })()
}
