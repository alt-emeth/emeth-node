import fs from 'fs'
import { BigNumber } from '@ethersproject/bignumber'
import { Knex } from 'knex'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import database, { DatabaseMiddlewareArguments } from '../middlewares/database'
import wallet from '../middlewares/wallet'

let db: Knex

const attach: CommandModule<{} & DatabaseMiddlewareArguments & ContractsMiddlewareArguments, {} & DatabaseMiddlewareArguments & ContractsMiddlewareArguments> = {
  command: 'attach',
  describe: 'Attach to Emeth',
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
    const workers = await args.db.from('workers')

    let totalPowerCapacity = BigNumber.from(0)
    for (const worker of workers) {
      totalPowerCapacity = totalPowerCapacity.add(BigNumber.from(worker.powerCapacity))
    }

    const { emeth, emethToken } = args.contracts

    const depositPerCapacity: BigNumber = await emeth.DEPOSIT_PER_CAPACITY()
    console.log('deposit per capacity:' + depositPerCapacity.toString())

    const totalDeposit = totalPowerCapacity.mul(depositPerCapacity)
    console.log('total deposit:' + totalDeposit.toString())

    const maxParallelism = workers.length
    console.log(`maxParallelism:${maxParallelism}`)

    await (await emethToken.approve(emeth.address, totalDeposit)).wait(1)

    await (await emeth.functions.attach(totalDeposit, totalPowerCapacity, maxParallelism, {
      gasLimit: 4000000
    })).wait(1)
  }
}

export = attach
