import { Knex } from 'knex'
import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import watchContractEvent from '../lib/watch-contract-event'
import { WalletMiddlewareArguments } from './wallet'
import { JobStatus, LastWatchedBlock } from '../types/tables'
import { Logger } from 'log4js'
import interval from 'interval-promise'
import delay from 'delay'

const scanAssignedJob = async(args: Arguments) => {
  const {emeth} = (args as unknown as ContractsMiddlewareArguments).contracts
  const wallet = (args as unknown as WalletMiddlewareArguments).wallet
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const logger = args.logger as Logger
  const savedLastWatchedBlock = await db('lastWatchedBlock').first();
  let lastWatchedBlock: LastWatchedBlock
  if(savedLastWatchedBlock === undefined) {
    lastWatchedBlock = {blockNumber: -1}
  } else {
    lastWatchedBlock = savedLastWatchedBlock
  }

  const fromBlock = lastWatchedBlock.blockNumber + 1

  logger.info(`Start Scan Status event from ${fromBlock}`)

  const events = await emeth.queryFilter(emeth.filters.Status(null, null, null), fromBlock)

  for (let i=0; i<events.length; i++) {
    const event = events[i]

    const jobId = event.args.jobId

    logger.info(`JobId:${jobId}, assignedNode:${event.args.nodeAddress}, my address: ${wallet.address}`)
    logger.info(`JobId:${jobId}, job status:${event.args.status}`)

    const trx = await db.transaction()

    if (event.args.nodeAddress === wallet.address) {

      const assignedBlock = (event.args.status.eq(JobStatus.ASSIGNED))? event.blockNumber : undefined

      const job = await emeth.jobs(jobId)
      const jobAssign = await emeth.jobAssigns(jobId)

      logger.info(`JobId:${jobId}, Latest assigned address:${jobAssign.node}`)
      logger.info(`JobId:${jobId}, Latest job status:${job.status}`)

      const sqliteJob = await trx('jobs').where({ jobId }).first()

      if(sqliteJob !== undefined) {
        logger.info(`JobId:${jobId}, Queued job assigned address:${sqliteJob.assignedNode}`)
        logger.info(`JobId:${jobId}, Queued job status:${sqliteJob.status}`)

        if(!job.status.eq(sqliteJob.status) || jobAssign.node != sqliteJob.assignedNode) {
          await trx('jobs').where({ jobId }).update({
            status: job.status.toNumber(),
            assignedNode: jobAssign.node,
            assignedBlock,
            updatedAt: new Date().getTime()
          })

          logger.info(`Updated queued job :${jobId}`)
        }
      } else {
        await trx('jobs').insert({
          jobId,
          assignedNode: jobAssign.node,
          status: job.status.toNumber(),
          assignedBlock,
          numOfAttempt: 0,
          createdAt: new Date().getTime(),
          updatedAt: new Date().getTime()
        })

        logger.info(`Queued job :${jobId}`)
      }
    }

    lastWatchedBlock.blockNumber = event.blockNumber
    if (lastWatchedBlock.id != null) {
      await trx('lastWatchedBlock').update(lastWatchedBlock)
    } else {
      [lastWatchedBlock.id] = await trx('lastWatchedBlock').insert(lastWatchedBlock)
    }

    await trx.commit()
  }

  logger.info(`End Scan Status event.`)
}
export default async function emethStatusWatcher (args: Arguments): Promise<void> {
  await scanAssignedJob(args)
  interval(async() => {
    await scanAssignedJob(args)
  }, 10000 as number, {
    stopOnError: false
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}
