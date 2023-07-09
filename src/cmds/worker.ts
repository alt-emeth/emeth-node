import axios from 'axios'
import fs from 'fs'
import interval from 'interval-promise'
import path from 'path'
import { CommandModule } from 'yargs'

import logger, { LoggerMiddlewareArguments } from '../middlewares/logger'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'

const worker: CommandModule<LoggerMiddlewareArguments & WalletMiddlewareArguments & {
  cacheServerUrl: string
  interval: number;
}, LoggerMiddlewareArguments & WalletMiddlewareArguments & {
  cacheServerUrl: string
  interval: number;
}> = {
  command: 'worker',
  describe: 'Serve as worker',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'worker.json'))
      .default('generatedUIDPath', path.resolve(__dirname, '..', '..', 'generated-uid', 'account.json'))
      .default('interval', 10000)
      .number(['interval'])
      .string(['privateKey'])
      .middleware(logger)
      .middleware(wallet)
  },
  handler: async (argv) => {
    const logger = argv.logger;

    logger.info(`Monitoring cache server at ${argv.interval / 1000}s intervals...`);

    interval(async () => {
      const cacheServerUrl = new URL(argv.cacheServerUrl);
      cacheServerUrl.searchParams.append("status", "1");

      const response = await axios(cacheServerUrl.toString(), {
        responseType: 'json',
      });

      const json = response.data;

      if (!Array.isArray(json)) {
        return;
      }

      const jobs = json.filter((job) => {
        return job.numParallel == 1 && job.programId == 999;
      });

      if (jobs.length == 0) {
        return;
      }

      jobs.sort((job1: any, job2: any) => {
        return (
          job2.fuelLimit * job2.fuelPrice - job1.fuelLimit * job1.fuelPrice
        );
      });

      const job = jobs[0];

      console.log(job);
    }, argv.interval, {
      stopOnError: false
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    }) as unknown as void
  }
}

export = worker
