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

const dbInit: CommandModule<{} & DatabaseMiddlewareArguments & WalletMiddlewareArguments, {} & DatabaseMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'db-init',
  describe: 'database initilize',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([database])
      .middleware((args) => {
        db = args.db
      })
      .onFinishCommand((): void => {
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        return db.destroy() as unknown as void
      })
  },
  handler: async (args) => {
    const db = (args as unknown as DatabaseMiddlewareArguments).db

    await db.migrate.down()
    await db.migrate.up()
  }
}

export = dbInit
