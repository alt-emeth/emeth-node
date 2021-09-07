import { Arguments } from 'yargs'
import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { Logger } from 'log4js'
import { JobStatus } from '../types/tables'
import interval from 'interval-promise'
import { Emeth } from '../types/contracts'
import { Knex } from 'knex'
import { clean } from '../lib/storage'
import axios from 'axios'

const checkCleanJobs = async(emeth:Emeth, db:Knex, logger:Logger):Promise<Array<string>> => {
  const cleanJobs = []

  const sqliteJobs = await db.from('jobs')

  for (let i=0; i<sqliteJobs.length; i++) {
    const sqliteJob = sqliteJobs[i]
    const jobId = sqliteJob.jobId

    const job = await emeth.jobs(jobId)

    logger.info(`JobId:${jobId}, AssignedJob:${JSON.stringify(job)}`)

    logger.info(`JobId:${jobId}, Current status:${job.status}`)

    if (job.status.eq(JobStatus.VERIFIED) ||
        job.status.eq(JobStatus.REJECTED) ||
        job.status.eq(JobStatus.CANCELED) ||
        job.status.eq(JobStatus.TIMEOUT) ||
        job.status.eq(JobStatus.FAILED) ||
        job.status.eq(JobStatus.DECLINED)) {

      logger.info(`JobId:${jobId}, This job is no longer assigned, so delete unnecessary files`)

      cleanJobs.push(jobId)
    }

  }

  return cleanJobs
}

const handler = async(args: Arguments) => {
  const logger = args.logger as Logger
  const parallelGPTPath = args.parallelGPTPath as string
  const {emeth} = (args as unknown as ContractsMiddlewareArguments).contracts
  const db = (args as unknown as DatabaseMiddlewareArguments).db

  logger.info('Start clean process')

  const jobIds = await checkCleanJobs(emeth, db, logger)
  for(let i=0; i<jobIds.length; i++) {
    const jobId = jobIds[i]
    clean(jobId, parallelGPTPath, logger)
    try {
      const workers = await db.from('workers')
      for(const worker of workers) {
        await axios.post(`http://${worker.ipAddress}:3000/api/v1/clean`, {jobId})
      }
    } catch (e) {
      console.log(e)
    }
  }

  logger.info('End clean process')
}

export default async function cleaner (args: Arguments): Promise<void> {
  interval(async() => {
    await handler(args)
  }, 1000 * 60 * 60 * 24, {stopOnError: false}) as unknown as void

  await handler(args)
}