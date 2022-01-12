import { Arguments } from 'yargs'
import { DatabaseMiddlewareArguments } from './database'
import { Logger } from 'log4js'
import { JobStatus } from '../types/tables'
import interval from 'interval-promise'
import * as storage from '../lib/storage'
import axios from 'axios'
import { Wallet } from '@ethersproject/wallet'
import { sign } from '../lib/crypto'
import { BoardJob } from '../types/api'


const clean = async(args: Arguments) => {
  const logger = args.logger as Logger
  const parallelGPTPath = args.parallelGPTPath as string
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const wallet = args.wallet as Wallet

  logger.info(`--- BEGIN --- file clean`)

  const sqliteJobs = await db('jobs').whereIn('status', 
   [JobStatus.VERIFIED, 
    JobStatus.REJECTED, 
    JobStatus.CANCELED, 
    JobStatus.TIMEOUT, 
    JobStatus.FAILED, 
    JobStatus.DECLINED])

  for(const job of sqliteJobs) {
    const jobId = job.job_id

    logger.info(`JobId:${jobId}, This job is no longer assigned, so delete unnecessary files`)

    storage.clean(jobId, parallelGPTPath, logger)

    try {
      const workers = await db.from('workers')
      for(const worker of workers) {
        const timestamp = new Date().getTime()
        const sig = await sign(['uint256'], [timestamp], wallet)
      
        await axios.post(`${worker.url}/api/v1/clean`, 
        {
          jobId,
          auth: {
            sig,
            timestamp
          }
        })
      }
    } catch (e) {
      console.log(e)
    }
  }

  logger.info(`--- END --- file clean`)

}

export default async function fileCleaner (args: Arguments): Promise<void> {
  interval(async() => {
    await clean(args)
  }, 1000 * 60 * 60 * 24, {stopOnError: false}) as unknown as void

  await clean(args)
}