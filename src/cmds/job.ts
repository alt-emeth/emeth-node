import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'
import { JobStatus } from '../types/tables'
import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import { exit } from 'process'

const parseResult = (result:any, jobStatusStr:any) => {
  const out:any = {}

  Object.keys(result).forEach((key:any) => {
    if(isNaN(key)) {
      const val = result[key] as any

      if(key == "status") {
        out[key] = jobStatusStr[val.toNumber()]
      } else if(val._isBigNumber) {
        out[key] = val.toString()
      } else {
        out[key] = result[key]
      }
    }
  })

  return out
}

const job: CommandModule<{} & ContractsMiddlewareArguments & WalletMiddlewareArguments, {} & ContractsMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'job',
  describe: 'get job info',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([wallet, contracts])
  },
  handler: async (args) => {
    const { emeth } = args.contracts

    const jobStatusStr = Object.keys(JobStatus).reduce((ret:any, key) => {
      if(JobStatus[Number(key)] != null) {
        ret[Number(key)] = JobStatus[Number(key)];
      }
      return ret;
    }, {});

    const jobId = process.argv[3]

    const job = await emeth.jobs(jobId)
    const jobAssign = await emeth.jobAssigns(jobId)
    const jobDetail = await emeth.jobDetails(jobId)

    console.log("job")
    console.log(parseResult(job, jobStatusStr))
    console.log("jobAssign")
    console.log(parseResult(jobAssign, jobStatusStr))
    console.log("jobDetail")
    console.log(parseResult(jobDetail, jobStatusStr))

    exit()
  }
}

export = job
