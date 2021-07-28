import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet from '../middlewares/wallet'

const detach: CommandModule<{} & ContractsMiddlewareArguments, {} & ContractsMiddlewareArguments> = {
  command: 'detach',
  describe: 'Detach from Emeth',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([wallet, contracts])
  },
  handler: async (args) => {
    const { emeth } = args.contracts

    await (await emeth.detach()).wait(1)

    console.log('Detached from Emeth')
  }
}

export = detach
