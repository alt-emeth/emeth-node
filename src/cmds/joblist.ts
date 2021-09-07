import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import database, { DatabaseMiddlewareArguments } from '../middlewares/database'
import { exit } from 'process'
import * as tables from '../types/tables';
import { Knex } from 'knex'
import { Wallet } from 'ethers'

let db: Knex

const joblist: CommandModule<{} & DatabaseMiddlewareArguments & WalletMiddlewareArguments, {} & DatabaseMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'joblist',
  describe: 'assigned job list',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([database, wallet])
      .middleware((args) => {
        db = args.db
      })
      .onFinishCommand((): void => {
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        return db.destroy() as unknown as void
      })
  },
  handler: async (args) => {
    const wallet = args.wallet as Wallet
    const db = (args as unknown as DatabaseMiddlewareArguments).db

    const jobStatusStr = Object.keys(tables.JobStatus).reduce((ret:any, key) => {
      if(tables.JobStatus[Number(key)] != null) {
        ret[Number(key)] = tables.JobStatus[Number(key)];
      }
      return ret;
    }, {});

    const sqliteJobs = await db('jobs').where({assignedNode: wallet.address})

    for (let i=0; i<sqliteJobs.length; i++) {
      const job = sqliteJobs[i]
      console.log("Assigned job:", job.jobId, ", Status:", jobStatusStr[job.status], ", AssignedBlock#:", job.assignedBlock);
    }

    exit()
  }
}

export = joblist
