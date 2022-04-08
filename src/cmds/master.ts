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
import { computeRequiredPowerCapacity, estimateGas, estimateProcessingTime } from '../lib/emethFormula'
import emethStatusWatcher from '../middlewares/emeth-status-watcher'
import { extractCompletedJson } from '../lib/parallel-gpt'
import submitter from '../middlewares/submitter'
import fastFolderSizeSync from 'fast-folder-size/sync'

process.env.TZ = 'UTC'

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
      .middleware(exitHandler)
      .middleware(submitter)
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
    const model_cached_size = argv.model_cached_size as number

    interval(async () => {
      try {
        const cachedSize = fastFolderSizeSync(path.join(parallelGPTPath, 'model'))
        if(cachedSize) {
          if(cachedSize / (1024 * 1024 * 1024) > model_cached_size) {
            logger.info('Not enough storage space for model file')
            return
          }
        }

        logger.info(`--- BEGIN --- Recover suspended job`)

        const sqliteJobs = await db('jobs').where('status', JobStatus.PROCESSING)

        for(const sqliteJob of sqliteJobs) {
          let needRetry = false

          const jobId = sqliteJob.job_id

          if(processHolder.processes[jobId]) {
            logger.info(`JobId:${jobId}, This is processing now`)
            continue
          }

          const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)

          if(!fs.existsSync(logFile)) {
            logger.info(`JobId:${jobId}, log file is not exist. Need retry process. ${logFile}`)

            needRetry = true
          } else {
            const json:any = await extractCompletedJson(logFile)

            if(!json) {
              logger.info(`JobId:${jobId}, Learning is not completed yet. Need retry process`)

              needRetry = true
            }
          }

          if(needRetry) {

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

            logger.info(`JobId:${jobId}, Retry process.`)

            const jobDetail = await emeth.jobDetails(jobId)

            const availableWorkers = await findAvailableWorkers(db, logger, cooperative)
            const havingPowerCapacity = availableWorkers.reduce((accumulator, worker) => accumulator + worker.power_capacity, 0)
            let gas = await estimateGas(Math.floor(sqliteJob.data_size_mb as number), 5822, emeth)
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
              jobDetail,
              time,
              logger,
              emeth,
              emethToken,
              db,
              parallelGPTPath,
              storageApi,
              wallet,
              argv.batchSize as number,
              argv.device as string,
              argv.my_url as string,
              argv.processHolder as ProcessHolder,
              candidateWorkers
            )
          }
        }

        logger.info(`--- END --- Recover suspended job`)

        logger.info(`--- BEGIN --- Execute requested job`)

        const availableWorkers = await findAvailableWorkers(db, logger, cooperative)
        const havingPowerCapacity = availableWorkers.reduce((accumulator, worker) => accumulator + worker.power_capacity, 0)
        
        logger.info(`Mathing job. min_fee:${min_fee}, max_fee:${max_fee}, havingPowerCapacity:${havingPowerCapacity}`)

        if(havingPowerCapacity <= 0) {
          logger.info('havingPowerCapacity is zero')
          return
        }

        const boardJobs:BoardJob[] = (await axios.get(`${board_url}/api/v1/jobs`, {params: { status: JobStatus.REQUESTED }})).data

        boardJobs.sort((a, b) => {
          if(BigNumber.from(b.fee).gt(BigNumber.from(a.fee))) {
            return 1
          } else {
            return -1
          }
        })

        let targetJob:BoardJob|null = null

        for(const boardJob of boardJobs) {
          logger.info(`JobId:${boardJob.id}, deadline:${boardJob.deadline}, datasize:${boardJob.datasetSize}, fee:${boardJob.fee}`)

          if(boardJob.datasetSize < (1024 * 4)) {
            logger.info(`JobId:${boardJob.id}, size is too small`)
            continue
          }

          const size = Math.floor(boardJob.datasetSize / (1024*1024))

          if(BigNumber.from(boardJob.fee).gte(BigNumber.from(min_fee)) && 
            BigNumber.from(boardJob.fee).lte(BigNumber.from(max_fee))) {
              const gas = await estimateGas(size, 5822, emeth)
              const time = estimateProcessingTime(gas, Math.floor(havingPowerCapacity))

              const now = new Date().getTime() / 1000
              logger.info(`Estimated completed time:${now + time}`)

              if(now + time < boardJob.deadline - 3600) {
                targetJob = boardJob
                break
              }
          }
        }

        if(!targetJob) {
          return
        }


        const jobId = targetJob.id

        const job = await emeth.jobs(jobId)
        const jobDetail = await emeth.jobDetails(jobId)

        logger.info(`JobId:${jobId}, job exist:${String(job.exist)}, job status:${String(job.status)}`)

        if (!job.status.eq(JobStatus.REQUESTED)) {
          logger.info(`JobId:${jobId}, This is not requested job.`)
          return
        }

        const size = Math.floor(targetJob.datasetSize / (1024*1024))
        let gas = await estimateGas(size, 5822, emeth)
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
          jobDetail,
          time,
          logger,
          emeth,
          emethToken,
          db,
          parallelGPTPath,
          storageApi,
          wallet,
          argv.batchSize as number,
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
