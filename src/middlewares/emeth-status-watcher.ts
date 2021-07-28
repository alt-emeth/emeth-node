import { Knex } from 'knex'
import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import watchContractEvent from '../lib/watch-contract-event'
import { LastWatchedBlock } from '../types/tables'

export default function emethStatusWatcher (args: Arguments): void {
  const contracts = (args as unknown as ContractsMiddlewareArguments).contracts
  const db = (args as unknown as DatabaseMiddlewareArguments).db

  return db('lastWatchedBlock').first().then((savedLastWatchedBlock) => {
    let lastWatchedBlock: LastWatchedBlock
    if (savedLastWatchedBlock === undefined) {
      lastWatchedBlock = {
        blockNumber: 0
      }
    } else {
      lastWatchedBlock = savedLastWatchedBlock
    }

    const contractEventWatcher = watchContractEvent(
      contracts.emeth,
      contracts.emeth.filters.Status(null, null, null),
      lastWatchedBlock.blockNumber
    )

    let trx: Knex.Transaction

    contractEventWatcher.on('startBlock', async (blockNumber) => {
      trx = await db.transaction()
    })

    contractEventWatcher.on('event', async (event) => {
      if (event.args == null) { return }

      const jobId = event.args.jobId
      const jobIdHex = (event.args.jobId as Buffer).toString('hex')

      const jobsResult = await contracts.emeth.jobs(jobId)
      if (!jobsResult.status.eq(1)) {
        console.log(`This is not assigned status :${jobIdHex}`)
        return
      }

      const jobAssign = await contracts.emeth.jobAssigns(jobId)
      if (jobAssign.node !== await contracts.emeth.signer.getAddress()) {
        console.log(`This is not assigned to me:${jobIdHex}`)
        return
      }

      const job = await trx('jobs').where({ jobId: jobIdHex }).first()

      if (job != null && job.status == 1) {
        console.log(`Already queued :${jobIdHex}`)
      } else if(job != null) {
        await trx('jobs').where({ jobId:jobIdHex }).update({
          status: 1,
          updatedAt: new Date().getTime()
        })
        console.log(`Updated job :${jobIdHex}`)
      } else {
        await trx('jobs').insert({
          jobId: jobIdHex,
          assignedNode: jobAssign.node,
          status: 1,
          numOfAttempt: 0,
          createdAt: new Date().getTime(),
          updatedAt: new Date().getTime()
        })
        console.log(`Queued job :${jobIdHex}`)
      }
    })

    contractEventWatcher.on('endBlock', async (blockNumber) => {
      lastWatchedBlock.blockNumber = blockNumber

      if (lastWatchedBlock.id != null) {
        await trx('lastWatchedBlock').update(lastWatchedBlock)
      } else {
        [lastWatchedBlock.id] = await trx('lastWatchedBlock').insert(lastWatchedBlock)
      }

      await trx.commit()
    })
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}
