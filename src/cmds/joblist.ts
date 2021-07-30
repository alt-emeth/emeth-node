import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import * as tables from '../types/tables';
import { exit } from 'process'

interface JobStatus {
  [jobId: string] :{statusStr: string, assignedBlockNo: number|null}
}

const joblist: CommandModule<{} & ContractsMiddlewareArguments & WalletMiddlewareArguments, {} & ContractsMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'joblist',
  describe: 'assigned job list',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([wallet, contracts])
  },
  handler: async (args) => {
    const jobStatusStr = Object.keys(tables.JobStatus).reduce((ret:any, key) => {
      if(tables.JobStatus[Number(key)] != null) {
        ret[Number(key)] = tables.JobStatus[Number(key)];
      }
      return ret;
    }, {});
    const { emeth } = args.contracts
    const wallet = args.wallet
    const jobIds = []
    const jobStatus:JobStatus = {}
    const events = await emeth.queryFilter(emeth.filters.Status(null, null, null))
    for (const event of events) {
      const node = event.args.nodeAddress
      if (node === wallet.address) {
        const jobId = event.args.jobId
        const status = event.args.status.toNumber()
        const statusStr = jobStatusStr[status]
        jobIds.push(jobId)
        if(!jobStatus[jobId]) {
          jobStatus[jobId] = {statusStr, assignedBlockNo: null}
        } else {
          jobStatus[jobId].statusStr = statusStr
        }
        if(status == tables.JobStatus.ASSIGNED) {
          jobStatus[jobId].assignedBlockNo = event.blockNumber
        }
      }
    }
    const uniqJobIds = Array.from(new Set(jobIds))
    for (let i=0; i<uniqJobIds.length; i++) {
      const jobId = uniqJobIds[i]
      console.log("Assigned job:", jobId, ", Status:", jobStatus[jobId].statusStr, ", AssignedBlock#:", jobStatus[jobId].assignedBlockNo);
    }
    exit()
  }
}

export = joblist
