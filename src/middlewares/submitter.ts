import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { JobStatus } from '../types/tables'
import { Logger } from 'log4js'
import interval from 'interval-promise'
import { WalletMiddlewareArguments } from './wallet'
import { ProcessHolder } from './exit-handler'
import path from 'path'
import fs from 'fs'
import readline from 'readline'
import { submit } from '../services/job-service'
import { putS3 } from '../lib/storage'
import { extractCompletedJson } from '../lib/parallel-gpt'

export default async function submitter (args: Arguments): Promise<void> {
  const {emeth} = (args as unknown as ContractsMiddlewareArguments).contracts
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const wallet = (args as unknown as WalletMiddlewareArguments).wallet
  const logger = args.logger as Logger
  const processHolder = args.processHolder as ProcessHolder
  const parallelGPTPath = args.parallelGPTPath as string
  const storageApi = args.storageApi as string

  interval(async() => {
    logger.info(`--- BEGIN --- Check need submit job`)

    const sqliteJobs = await db('jobs').where('status', JobStatus.PROCESSING)

    for(const sqliteJob of sqliteJobs) {
      try {
        const jobId = sqliteJob.job_id

        if(processHolder.processes[jobId]) {
          logger.info(`JobId:${jobId}, This is processing now`)
          continue
        }
  
        const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)
      
        if(!fs.existsSync(logFile)) {
          logger.info(`JobId:${jobId}, log file is not exist. It is not completed yet. ${logFile}`)
          continue
        }
      
        const json:any = await extractCompletedJson(logFile)
      
        if(json) {
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

          logger.info(`JobId:${job.jobId}, Learning is completed. Try submit.`)
  
          const fileName = json.fileName
          logger.info(`JobId:${job.jobId}, Start file upload. ${fileName}`)
          const result = await putS3(storageApi, wallet, job.jobId, fileName, logger)
          logger.info(`JobId:${job.jobId}, File upload completed.`)
    
          await submit(logger, jobId, result, emeth, db)
  
          logger.info(`JobId:${job.jobId}, Submit complete. fileName:${fileName}`)
        }
      } catch (e) {
        logger.error(e)
      }
    }

    logger.info(`--- END --- Check need submit job`)
  }, 10000 as number, {
    stopOnError: false
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}