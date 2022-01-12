import axios from 'axios'
import { Knex } from 'knex'

import { COOPERATIVE } from '../lib/consistants'
import { Worker } from '../types/tables'
import { Logger } from 'log4js'

export async function findAvailableWorkers (db: Knex, logger:Logger, cooperative:string): Promise<Worker[]> {
  let availableWorkers: Worker[] = []
  const deadWorkers: Worker[] = []
  const workers: Worker[] = await db('workers')
  for (const worker of workers) {
    try {
      const isRunning = await (await axios.get(`${worker.url}/api/v1/isRunning`, { timeout: 1000 * 30 })).data.result

      if (!isRunning) {
        availableWorkers.push(worker)
      }
    } catch (e) {
      console.log(e)

      deadWorkers.push(worker)
    }
  }

  const trx = await db.transaction()

  try {
    for(const worker of deadWorkers) {
      await trx('workers').delete().where({ url: worker.url })
  
      logger.info(`Worker Disconnected. ${worker.url}`)
    }
  
    await trx.commit()
  } catch (e) {
    await trx.rollback()
    logger.error(e)
  }

  availableWorkers.sort((a, b) => {
    return b.power_capacity - a.power_capacity
  })

  if(cooperative == COOPERATIVE['1v1'] && availableWorkers.length > 0) {
    availableWorkers = [availableWorkers[0]]
  }

  return availableWorkers
}