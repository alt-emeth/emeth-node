import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import database, { DatabaseMiddlewareArguments } from '../middlewares/database'
import { exit } from 'process'
import { Knex } from 'knex'
import { JobStatus } from '../types/tables'

let db: Knex

const decline: CommandModule<{} & ContractsMiddlewareArguments & WalletMiddlewareArguments & DatabaseMiddlewareArguments, {} & ContractsMiddlewareArguments & WalletMiddlewareArguments & DatabaseMiddlewareArguments> = {
  command: 'decline',
  describe: 'decline job',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([database, wallet, contracts])
      .middleware((args) => {
        db = args.db
      })
      .onFinishCommand((): void => {
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        return db.destroy() as unknown as void
      })
  },
  handler: async (args) => {
    const { emeth } = args.contracts
    const wallet = args.wallet

    if(process.argv[3] != null) {
      const jobId = process.argv[3]
      const emethJob = await emeth.jobs(jobId)

      console.log(`Current job status:${emethJob.status}`)

      if(emethJob.status.eq(JobStatus.ASSIGNED) || emethJob.status.eq(JobStatus.PROCESSING)) {
        await emeth.decline(jobId)
        console.log(`Declined job:${jobId}`)
      }

      exit()
    }

    const jobs = await db('jobs').where('assignedNode', wallet.address)
    
    for (let i=0; i< jobs.length; i++) {
      try {
        const job = jobs[i]

        console.log(`Assigned job:${job.jobId}`)

        const emethJob = await emeth.jobs(job.jobId)

        console.log(`Current job status:${emethJob.status}`)

        if(emethJob.status.eq(JobStatus.ASSIGNED) || emethJob.status.eq(JobStatus.PROCESSING)) {
          await emeth.decline(job.jobId)
          console.log(`Declined job:${job.jobId}`)
        }
      } catch (e) {
        console.log(e)
      }
    }

    exit()
  }
}

export = decline
