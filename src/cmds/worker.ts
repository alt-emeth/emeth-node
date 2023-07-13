import axios from 'axios';
import { constants } from 'ethers';
import fs from 'fs';
import interval from 'interval-promise';
import path from 'path';
import { CommandModule } from 'yargs';

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts';
import logger, { LoggerMiddlewareArguments } from '../middlewares/logger';
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet';

const worker: CommandModule<
  LoggerMiddlewareArguments &
    ContractsMiddlewareArguments &
    WalletMiddlewareArguments & {
      cacheServerUrl: string;
      interval: number;
      iterations?: number;
      emethCoreContractAddress: string;
    },
  LoggerMiddlewareArguments &
    ContractsMiddlewareArguments &
    WalletMiddlewareArguments & {
      cacheServerUrl: string;
      interval: number;
      iterations?: number;
      emethCoreContractAddress: string;
    }
> = {
  command: 'worker',
  describe: 'Serve as worker',
  builder: (yargs) => {
    return yargs
      .config('config', (configPath) => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'worker.json'))
      .default(
        'generatedUIDPath',
        path.resolve(__dirname, '..', '..', 'generated-uid', 'account.json'),
      )
      .default('interval', 10000)
      .number(['interval', 'iterations'])
      .string(['privateKey', 'emethCoreContractAddress', 'emethTokenContractAddress'])
      .middleware(wallet)
      .middleware(contracts)
      .middleware(logger);
  },
  handler: async (argv) => {
    const logger = argv.logger;

    logger.info(`Monitoring cache server at ${argv.interval / 1000}s intervals...`);

    await interval(
      async () => {
        try {
          const cacheServerUrl = new URL(argv.cacheServerUrl);
          cacheServerUrl.searchParams.append('status', '1');

          const response = await axios(cacheServerUrl.toString(), {
            responseType: 'json',
          });

          const json = response.data;

          if (!Array.isArray(json)) {
            logger.warn('Cache server has returned corrupted JSON.');

            return;
          }

          const jobs = json.filter((job) => {
            return job.numParallel == 1 && job.programId == 999;
          });

          if (jobs.length == 0) {
            return;
          }

          jobs.sort((job1: any, job2: any) => {
            return job2.fuelLimit * job2.fuelPrice - job1.fuelLimit * job1.fuelPrice;
          });

          const job = jobs[0];

          logger.info(`[Job ID:${job.id}] Starting to process...`);

          await (
            await argv.contracts.emethToken.approve(
              argv.emethCoreContractAddress,
              constants.MaxUint256,
            )
          ).wait();

          await (await argv.contracts.emethCore.process(job.id)).wait();

          logger.info(`[Job ID:${job.id}] Submitting the result...`);

          await (await argv.contracts.emethCore.submit(job.id, 'test', job.fuelLimit)).wait();
        } catch (e) {
          logger.error(e);
        }
      },
      argv.interval,
      {
        iterations: argv.iterations || Infinity,
        stopOnError: false,
      },
    );
  },
};

export = worker;
