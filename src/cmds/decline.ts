import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import { exit } from 'process'


const decline: CommandModule<{} & ContractsMiddlewareArguments & WalletMiddlewareArguments, {} & ContractsMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'decline',
  describe: 'decline job',
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
    const jobId = await emeth.lastJobAssigned(wallet.address)
    console.log(`Assigned job:${jobId}`)
    if(Number(jobId) == 0) {
      console.log("This is not assigned")
      exit()
    }
    await emeth.decline(jobId)
    console.log(`Declined job:${jobId}`)
    exit()
  }
}

export = decline
