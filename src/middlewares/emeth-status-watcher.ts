import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { JobStatus, ContributionStatus, LastWacthedJobIndex } from '../types/tables'
import { Logger } from 'log4js'
import interval from 'interval-promise'
import { WalletMiddlewareArguments } from './wallet'
import axios from 'axios'
import { Emeth } from '../types/contracts'
import { Knex } from 'knex'

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

const scanStatusEvent = async(emeth:Emeth, trx:Knex.Transaction, logger:Logger) => {
  const lastWatchedBlock = await trx('last_watched_block').first()
  let status_event = (lastWatchedBlock?.status_event)? lastWatchedBlock.status_event : -1
  const fromBlock = status_event + 1

  logger.info(`--- BEGIN --- Scan status event from ${fromBlock}`)

  const events = await emeth.queryFilter(emeth.filters.Status(null, null, null), fromBlock)

  events.sort((a, b) => {
    return a.blockNumber - b.blockNumber
  })

  for(const event of events) {
    const sqliteJob = await trx('jobs').where('job_id', event.args.jobId).first()

    if(sqliteJob) {

      if(!event.args.status.eq(sqliteJob.status)) {
        await trx('jobs').update({
          status: event.args.status.toNumber()
        }).where('job_id', event.args.jobId)
  
        logger.info(`Updated queued job :${event.args.jobId}`)
      }

      const contributions = await trx('contributions').where('job_id', event.args.jobId).andWhere('num_attempt', sqliteJob.num_attempt)

      for (const contribution of contributions) {
        let status:number|null = null

        logger.info(`JobId:${event.args.jobId}, num_attempt:${sqliteJob.num_attempt}, worker:${contribution.worker_address}, job status:${sqliteJob.status}, contribution status:${contribution.status}`)

        if(event.args.status.toNumber() == JobStatus.VERIFIED && contribution.status != ContributionStatus.VERIFIED) {
          status = ContributionStatus.VERIFIED
        } else if(event.args.status.toNumber() == JobStatus.FAILED && contribution.status != ContributionStatus.FAILED) {
          status = ContributionStatus.FAILED
        }

        if(status) {
          await trx('contributions').update({
            status
          }).where('job_id', event.args.jobId)
          .andWhere('num_attempt', sqliteJob.num_attempt)
          .andWhere('worker_address', contribution.worker_address)

          logger.info(`Updated contribution status:${status}`)
        }
      }
    }

    status_event = event.blockNumber
  }

  if(lastWatchedBlock) {
    await trx('last_watched_block').update({
      status_event
    })
  } else {
    await trx('last_watched_block').insert({
      status_event
    })
  }

  logger.info("--- END --- Scan status event")
}

const scanCancelEvent = async(emeth:Emeth, trx:Knex.Transaction, logger:Logger) => {
  const lastWatchedBlock = await trx('last_watched_block').first()
  let cancel_event = (lastWatchedBlock?.cancel_event)? lastWatchedBlock.cancel_event : -1
  const fromBlock = cancel_event + 1

  logger.info("--- BEGIN --- Monitoring cancel event. fromBlock:" + fromBlock)

  const events = await emeth.queryFilter(emeth.filters.Cancel(null), fromBlock)

  events.sort((a, b) => {
    return a.blockNumber - b.blockNumber
  })

  for(const event of events) {
    const sqliteJob = await trx('jobs').where('job_id', event.args.jobId).first()

    if(sqliteJob) {
      await trx('jobs').update({
        status: JobStatus.CANCELED
      }).where('job_id', event.args.jobId)

      logger.info(`JobId: ${event.args.jobId}, Updated queued job to cancel`)
    }

    cancel_event = event.blockNumber
  }

  if(lastWatchedBlock) {
    await trx('last_watched_block').update({
      cancel_event
    })
  } else {
    await trx('last_watched_block').insert({
      cancel_event
    })
  }

  logger.info("--- END --- Monitoring cancel event")
}

export default async function emethStatusWatcher (args: Arguments): Promise<void> {
  interval(async() => {
    await checkAssignedJob(args)

    const {emeth} = (args as unknown as ContractsMiddlewareArguments).contracts
    const db = (args as unknown as DatabaseMiddlewareArguments).db
    const logger = args.logger as Logger
  
    const trx = await db.transaction()

    try {
      await scanStatusEvent(emeth, trx, logger)
      await scanCancelEvent(emeth, trx, logger)

      await trx.commit()
    } catch (e) {
      await trx.rollback()
      logger.error(e)
    }
  }, 10000 as number, {
    stopOnError: false
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}