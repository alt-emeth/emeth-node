import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import { exit } from 'process'


const parseResult = (result:any) => {
  const out:any = {}

  Object.keys(result).forEach((key:any) => {
    if(isNaN(key)) {
      const val = result[key] as any

      if(val._isBigNumber) {
        out[key] = val.toString()
      } else {
        out[key] = result[key]
      }
    }
  })

  return out
}

const node: CommandModule<{} & ContractsMiddlewareArguments & WalletMiddlewareArguments, {} & ContractsMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'node',
  describe: 'get node info',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([wallet, contracts])
  },
  handler: async (args) => {
    const { emeth } = args.contracts
    const wallet = args.wallet

    const nodeAddress = (process.argv[3])? process.argv[3] : wallet.address
    const node = await emeth.nodes(nodeAddress)

    console.log(parseResult(node))

    exit()
  }
}

export = node
