import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import database, { DatabaseMiddlewareArguments } from '../middlewares/database'
import logger, { LoggerMiddlewareArguments } from '../middlewares/logger'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import masterApi from '../middlewares/masterApi'
import { Logger } from 'log4js'
import { JobStatus, Worker } from '../types/tables'
import interval from 'interval-promise'
import * as jobService from '../services/job-service'
import fileCleaner from '../middlewares/file-cleaner'
import exitHandler, { ProcessHolder } from '../middlewares/exit-handler'
import readline from 'readline'
import axios from 'axios'
import { putS3 } from '../lib/storage'
import { Emeth } from '../types/contracts'
import { Wallet } from '@ethersproject/wallet'
import { Knex } from 'knex'
import { BoardJob } from '../types/api'
import { collectCandidateWorkerInfo } from '../lib/workers'
import { COOPERATIVE } from '../lib/consistants'
import { findAvailableWorkers } from '../services/worker-service'
import { BigNumber } from '@ethersproject/bignumber'
import { computeRequiredPowerCapacity, estimateProcessingTime } from '../lib/emethFormula'
import emethStatusWatcher from '../middlewares/emeth-status-watcher'

process.env.TZ = 'UTC'

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
  wallet:Wallet, 
  parallelGPTPath: string, 
  logger:Logger,
  processHolder: ProcessHolder,
  db:Knex
  ):Promise<Array<{jobId:string, needProcess:boolean, needSubmit:boolean, fileName:string|null, fileSize:number|null}>> => {

  const recoverJobs = [] as Array<{jobId:string, needProcess:boolean, needSubmit:boolean, fileName:string|null, fileSize:number|null}>

  const sqliteJobs = await db('jobs').where('status', JobStatus.PROCESSING)

  for(const sqliteJob of sqliteJobs) {
    const jobId = sqliteJob.job_id

    const job = await emeth.jobs(jobId)

    logger.info(`processing job:${JSON.stringify(job)}`)

    if(!job.status.eq(JobStatus.PROCESSING)) {
      logger.info(`JobId:${job.jobId}, This is not processing status:${job.status}`)
      continue
    }

    const jobAssign = await emeth.jobAssigns(jobId);
    logger.info(`Assigned node:${jobAssign.node}, my address:${wallet.address}`)
  
    if(jobAssign.node != wallet.address) {
      logger.info(`JobId:${job.jobId}, This is not assigned to me`)
      continue
    }

    if(processHolder.processes[jobId]) {
      logger.info(`JobId:${job.jobId}, This is processing now`)
      continue
    }

    logger.info(`JobId:${job.jobId}, This is a suspended job. Need recovor`)
  
    const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)
  
    if(!fs.existsSync(logFile)) {
      logger.info(`JobId:${job.jobId}, log file is not exist. Need retry process. ${logFile}`)

      recoverJobs.push({jobId, needProcess:true, needSubmit: false, fileName:null, fileSize:sqliteJob.data_size_mb})

      continue
    }
  
    const json:any = await extractCompletedJson(logFile)
  
    if(!json) {
      logger.info(`JobId:${job.jobId}, Learning is not completed yet. Need retry process`)
      recoverJobs.push({jobId, needProcess:true, needSubmit: false, fileName:null, fileSize:sqliteJob.data_size_mb})

      continue
    }
  
    logger.info(`JobId:${job.jobId}, Learning is completed. Need retry submit.`)

    recoverJobs.push({jobId, needProcess:false, needSubmit: true, fileName:json.fileName, fileSize:null})
  }

  return recoverJobs
}

const master: CommandModule<{
  port: number
} & DatabaseMiddlewareArguments & LoggerMiddlewareArguments,
{
  port: number
} & DatabaseMiddlewareArguments & LoggerMiddlewareArguments> = {
  command: 'master',
  describe: 'Serve as master',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .default('parallelGPTPath', path.resolve(__dirname, '..', '..', 'parallelGPT'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([database, wallet, contracts])
      .middleware(logger)
      .middleware(masterApi)
      .middleware(emethStatusWatcher)
      .middleware(fileCleaner)
      .middleware(exitHandler)
  },
  handler: (argv) => {
    const logger = argv.logger as Logger
    const parallelGPTPath = argv.parallelGPTPath as string
    const storageApi = argv.storageApi as string
    const processHolder = argv.processHolder as ProcessHolder
    const {emeth, emethToken} = (argv as unknown as ContractsMiddlewareArguments).contracts
    const wallet = (argv as unknown as WalletMiddlewareArguments).wallet as Wallet
    const db = (argv as unknown as DatabaseMiddlewareArguments).db
    const board_url = argv.info_server_url as string
    const cooperative = argv.cooperative as string
    const min_fee = String(argv.min_fee)
    const max_fee = String(argv.max_fee)

    interval(async () => {
      try {
        logger.info(`--- BEGIN --- Recover suspended job`)

        const recoverJobs = await checkRecoverJob(emeth, wallet, parallelGPTPath, logger, processHolder, db)

        for(const recoverJob of recoverJobs) {

          const jobId = recoverJob.jobId
          const fileName = recoverJob.fileName
          const needSubmit = recoverJob.needSubmit
          const needProcess = recoverJob.needProcess
      
          if(needProcess) {
            logger.info(`JobId:${jobId}, Retry process.`)
      
            const job = await emeth.jobs(jobId)
      
            const availableWorkers = await findAvailableWorkers(db, logger, cooperative)
            const havingPowerCapacity = availableWorkers.reduce((accumulator, worker) => accumulator + worker.power_capacity, 0)
            let gas = await (await emeth.getEstimatedGas(Math.floor(recoverJob.fileSize as number), 5822)).toNumber()
            let time = job.deadline.sub(job.requestedAt).toNumber()
            gas = Math.floor(gas)
            time = Math.floor(time)
            const requiredPowerCapacity = computeRequiredPowerCapacity(gas, time)

            const { candidateWorkerPowerCapacity, candidateWorkers } = collectCandidateWorkerInfo(availableWorkers, requiredPowerCapacity)
          
            logger.info(`JobId:${jobId},
            requredPowerCapacity:${requiredPowerCapacity.toString()},
            havingPowerCapacity:${havingPowerCapacity.toString()},
            candidateWorkerPowerCapacity:${candidateWorkerPowerCapacity.toString()},
            candidateWorkers:${JSON.stringify(candidateWorkers)}`
            )
            if (candidateWorkerPowerCapacity < requiredPowerCapacity) {
              throw new Error(`JobId:${jobId}, Power capacity is not enoguh.`)
            }
            if (candidateWorkers.length === 0) {
              throw new Error(`JobId:${jobId}, candidateWorkers is zero even Power capacity is enoguh`)
            }

            await jobService.process(
              job,
              time,
              logger,
              emeth,
              emethToken,
              db,
              parallelGPTPath,
              storageApi,
              wallet,
              argv.batchSize as number,
              argv.n_epochs as number,
              argv.device as string,
              argv.my_url as string,
              argv.processHolder as ProcessHolder,
              candidateWorkers
            )
      
          } else if(needSubmit) {
            logger.info(`JobId:${jobId}, Retry submit.`)
      
            const job = await emeth.jobs(jobId)
          
            let uploadedFile = `${jobId}-${wallet.address.toLowerCase()}${path.extname(fileName as string)}`
            logger.info(`JobId:${job.jobId}, check uploaded:${uploadedFile}`)
          
            let uploadedSize = 0
            try {
              uploadedSize = (await axios.get(`${storageApi}/api/v1/sizeOf?key=result/${uploadedFile}`)).data.result
            } catch (e) {
              console.log(e)
            }
            const savedSize = fs.statSync(fileName as string).size
            logger.info(`JobId:${job.jobId}, Saved file size:${savedSize}, Uploaded file size:${uploadedSize}`)
          
            if(savedSize !== Number(uploadedSize)) {
              logger.info(`JobId:${job.jobId}, File upload incomplete. Try upload again:${fileName}`)
              uploadedFile = await putS3(storageApi, wallet, jobId, fileName as string, logger)
            } else {
              logger.info(`JobId:${job.jobId}, File upload already completed. ${fileName}`)
            }
          
            logger.info(`JobId:${job.jobId}, Retry submit: ${uploadedFile}`)
        
            await jobService.submit(logger, jobId, uploadedFile, emeth, db)
        
            logger.info(`JobId:${job.jobId}, Retry submit is completed. fileName:${fileName}`)
          }
        }

        logger.info(`--- END --- Recover suspended job`)

        logger.info(`--- BEGIN --- Execute requested job`)

        const boardJobs:BoardJob[] = (await axios.get(`${board_url}/api/v1/jobs`, {params: { status: JobStatus.REQUESTED }})).data

        const candidateJobs:BoardJob[] = []
        
        const availableWorkers = await findAvailableWorkers(db, logger, cooperative)
        const havingPowerCapacity = availableWorkers.reduce((accumulator, worker) => accumulator + worker.power_capacity, 0)
        
        logger.info(`Mathing job. min_fee:${min_fee}, max_fee:${max_fee}, havingPowerCapacity:${havingPowerCapacity}`)

        if(havingPowerCapacity <= 0) {
          logger.info('havingPowerCapacity is zero')
          return
        }

        for(const boardJob of boardJobs) {
          const size = Math.floor(boardJob.datasetSize / (1024*1024))
          logger.info(`JobId:${boardJob.id}, deadline:${boardJob.deadline}, datasize:${size}, fee:${boardJob.fee}`)

          if(BigNumber.from(boardJob.fee).gte(BigNumber.from(min_fee)) && 
            BigNumber.from(boardJob.fee).lte(BigNumber.from(max_fee))) {
              const {gas, time} = await estimateProcessingTime(size, 5822, Math.floor(havingPowerCapacity), emeth)

              const now = new Date().getTime() / 1000
              logger.info(`Estimated completed time:${now + time}`)

              if(now + time < boardJob.deadline - 3600) {
                candidateJobs.push(boardJob)
              }
          }
        }
        
        candidateJobs.sort((a, b) => {
          if(BigNumber.from(b.fee).gt(BigNumber.from(a.fee))) {
            return 1
          } else {
            return -1
          }
        })

        if(candidateJobs.length == 0) {
          return
        }

        const targetJob = candidateJobs[0]

        const jobId = targetJob.id

        const job = await emeth.jobs(jobId)

        logger.info(`JobId:${jobId}, job exist:${String(job.exist)}, job status:${String(job.status)}`)

        if (!job.status.eq(JobStatus.REQUESTED)) {
          logger.info(`JobId:${jobId}, This is not requested job.`)
          return
        }

        const size = Math.floor(targetJob.datasetSize / (1024*1024))
        let gas = await (await emeth.getEstimatedGas(size, 5822)).toNumber()
        let time = job.deadline.sub(job.requestedAt).toNumber()
        gas = Math.floor(gas)
        time = Math.floor(time)
        const requiredPowerCapacity = computeRequiredPowerCapacity(gas, time)

        const { candidateWorkerPowerCapacity, candidateWorkers } = collectCandidateWorkerInfo(availableWorkers, requiredPowerCapacity)

        logger.info(`JobId:${jobId},
        requredPowerCapacity:${requiredPowerCapacity.toString()},
        havingPowerCapacity:${havingPowerCapacity.toString()},
        candidateWorkerPowerCapacity:${candidateWorkerPowerCapacity.toString()},
        candidateWorkers:${JSON.stringify(candidateWorkers)}`
        )
        if (candidateWorkerPowerCapacity < requiredPowerCapacity) {
          throw new Error(`JobId:${jobId}, Power capacity is not enoguh.`)
        }
        if (candidateWorkers.length === 0) {
          throw new Error(`JobId:${jobId}, candidateWorkers is zero even Power capacity is enoguh`)
        }

        await jobService.process(
          job,
          time,
          logger,
          emeth,
          emethToken,
          db,
          parallelGPTPath,
          storageApi,
          wallet,
          argv.batchSize as number,
          argv.n_epochs as number,
          argv.device as string,
          argv.my_url as string,
          argv.processHolder as ProcessHolder,
          candidateWorkers
        )

        logger.info(`--- END --- Execute assign job`)

      } catch (e) {
        logger.error(e.message)
      }
    }, 10000, {
      stopOnError: false
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    }) as unknown as void
  }
}

export = master
