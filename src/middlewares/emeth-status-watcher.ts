import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { JobStatus, ContributionStatus, LastWacthedJobIndex } from '../types/tables'
import { Logger } from 'log4js'
import interval from 'interval-promise'
import { WalletMiddlewareArguments } from './wallet'
import axios from 'axios'

const checkAssignedJob = async(args: Arguments) => {
  const {emeth} = (args as unknown as ContractsMiddlewareArguments).contracts
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const wallet = (args as unknown as WalletMiddlewareArguments).wallet
  const logger = args.logger as Logger
  const storageApi = args.storageApi as string

  logger.info(`--- BEGIN --- Check AssignedJob`)

  const lastWatchedJobIndex = await db.from('last_watched_job_index').first()
  const fromIndex = (lastWatchedJobIndex)? lastWatchedJobIndex.job_index + 1 : 0
  let saveIndex = (lastWatchedJobIndex)? lastWatchedJobIndex.job_index : 0

  logger.info(`Scan assigned job from index:${fromIndex}`)

  const assignedCount = await (await emeth.jobAssignedCount(wallet.address)).toNumber()

  for(var i=fromIndex; i<assignedCount; i++) {
    const jobId = await emeth.jobAssignedHistory(wallet.address, i)

    const sqliteJob = await db('jobs').where('job_id', jobId).first()

    if(!sqliteJob) {
      const job = await emeth.jobs(jobId)
      const jobDetail = await emeth.jobDetails(jobId)

      let size = await (await axios.get(`${storageApi}/api/v1/sizeOf?key=dataset/${jobDetail.dataset}`)).data.result
      size = size / (1024 * 1024)

      const trx = await db.transaction()

      try {
        await trx('jobs').insert({
          job_id: jobId,
          status: job.status.toNumber(),
          data_size_mb: size,
          program_id: jobDetail.programId.toNumber()
        })
        await trx.commit()
      } catch (e) {
        logger.error(e)
        await trx.rollback()
      }

      logger.info(`JobId:${jobId}, queued job`)
    }

    saveIndex = i
  }

  const trx = await db.transaction()

  try {
    if(lastWatchedJobIndex) {
      await trx('last_watched_job_index').update({
        job_index: saveIndex
      })
    } else {
      await trx('last_watched_job_index').insert({
        job_index: saveIndex
      })
    }
    await trx.commit()
  } catch (e) {
    logger.error(e)
    await trx.rollback()
  }

  logger.info(`--- END --- Check AssignedJob`)
}

const checkJobStatus = async(args: Arguments) => {
  const {emeth} = (args as unknown as ContractsMiddlewareArguments).contracts
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const logger = args.logger as Logger

  const sqliteJobs = await db.from('jobs').whereNotIn('status', 
  [JobStatus.VERIFIED, 
    JobStatus.REJECTED, 
    JobStatus.CANCELED, 
    JobStatus.TIMEOUT, 
    JobStatus.FAILED, 
    JobStatus.DECLINED])

  logger.info(`--- BEGIN --- Monitoring latest queued job status`)

  for(let i=0;i<sqliteJobs.length; i++) {
    const sqliteJob = sqliteJobs[i]
    const jobId = sqliteJob.job_id
    const job = await emeth.jobs(jobId)

    logger.info(`JobId:${jobId}, Latest job status:${job.status.toNumber()}`)

    logger.info(`JobId:${jobId}, Queued job status:${sqliteJob.status}`)

    const trx = await db.transaction()

    try {
      if(!job.status.eq(sqliteJob.status)) {
        await trx('jobs').where('job_id', jobId).update({
          status: job.status.toNumber()
        })
  
        logger.info(`Updated queued job :${jobId}`)
      }
  
      const contributions = await trx('contributions').where('job_id', jobId).andWhere('num_attempt', sqliteJob.num_attempt)
  
      for (const contribution of contributions) {
        let status:number|null = null
  
        logger.info(`JobId:${jobId}, num_attempt:${sqliteJob.num_attempt}, worker:${contribution.worker_address}, job status:${sqliteJob.status}, contribution status:${contribution.status}`)
    
        if(job.status.toNumber() == JobStatus.VERIFIED && contribution.status != ContributionStatus.VERIFIED) {
          status = ContributionStatus.VERIFIED
        } else if(job.status.toNumber() == JobStatus.FAILED && contribution.status != ContributionStatus.FAILED) {
          status = ContributionStatus.FAILED
        }
    
        if(status) {
          await trx('contributions').update({
            status
          }).where('job_id', jobId)
          .andWhere('num_attempt', sqliteJob.num_attempt)
          .andWhere('worker_address', contribution.worker_address)
    
          logger.info(`Updated contribution status:${status}`)
        }
      }
  
      await trx.commit()
    } catch (e) {
      logger.error(e)
      await trx.rollback()
    }
  }

  logger.info(`--- END --- Monitoring latest queued job status`)
}

export default async function emethStatusWatcher (args: Arguments): Promise<void> {
  interval(async() => {
    await checkAssignedJob(args)
    await checkJobStatus(args)
  }, 10000 as number, {
    stopOnError: false
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}