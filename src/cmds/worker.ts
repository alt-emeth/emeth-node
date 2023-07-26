import axios from 'axios';
import { constants } from 'ethers';
import FormData from 'form-data';
import fs from 'fs';
import interval from 'interval-promise';
import path from 'path';
import { setTimeout } from 'timers/promises';
import tmp from 'tmp-promise';
import unzipper from 'unzipper';
import { CommandModule } from 'yargs';
import { zip } from 'zip-a-folder';

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
      storageApiUrl: string;
    },
  LoggerMiddlewareArguments &
    ContractsMiddlewareArguments &
    WalletMiddlewareArguments & {
      cacheServerUrl: string;
      interval: number;
      iterations?: number;
      emethCoreContractAddress: string;
      storageApiUrl: string;
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

          let job = jobs[0];

          logger.info(`[Job ID:${job.id}] Starting to process...`);

          await (
            await argv.contracts.emethToken.approve(
              argv.emethCoreContractAddress,
              constants.MaxUint256,
            )
          ).wait();

          await (await argv.contracts.emethCore.process(job.id)).wait();

          logger.info(`[Job ID:${job.id}] Waiting cache server to update...`);

          while (true) {
            const cacheServerUrl = new URL(argv.cacheServerUrl);
            cacheServerUrl.searchParams.append('id', job.id);

            const response = await axios(cacheServerUrl.toString(), {
              responseType: 'json',
            });

            const json = response.data;

            if (json.id == job.id && json.status == 2) {
              job = json;

              break;
            }

            await setTimeout(10000);
          }

          logger.info(`[Job ID:${job.id}] Downloading dataset from storage...`);

          const signature = await argv.wallet.signMessage(job.id);

          const downloadUrl = new URL('download', argv.storageApiUrl);
          downloadUrl.searchParams.append('type', 'input');
          downloadUrl.searchParams.append('jobId', job.id);
          downloadUrl.searchParams.append('signature', signature);

          const downloadResponse = await axios(downloadUrl.toString(), {
            responseType: 'stream',
          });

          if (!downloadResponse.data) {
            return;
          }

          const data = downloadResponse.data;

          await tmp.withDir(
            async (inputDir) => {
              logger.info(`[Job ID:${job.id}] Unzipping dataset...`);

              const unzip = unzipper.Extract({ path: inputDir.path });

              data.pipe(unzip);

              await unzip.promise();

              await tmp.withDir(
                async (outputDir) => {
                  logger.info(
                    `[Job ID:${job.id}] Executing processor for program ID: ${job.programId}...`,
                  );

                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  const processor = require(path.join(
                    __dirname,
                    '..',
                    '..',
                    'emeth_modules',
                    `${job.programId}.js`,
                  )) as (job: unknown, inputDir: string, outputDir: string) => Promise<void>;

                  await processor(job, inputDir.path, outputDir.path);

                  await tmp.withFile(async (outputFile) => {
                    logger.info(`[Job ID:${job.id}] Zipping output...`);

                    await zip(outputDir.path, outputFile.path);

                    logger.info(`[Job ID:${job.id}] Uploading output to storage...`);

                    const uploadUrl = new URL('upload', argv.storageApiUrl);

                    const uploadFormData = new FormData();
                    uploadFormData.append('type', 'output');
                    uploadFormData.append('jobId', job.id);
                    uploadFormData.append('file', fs.createReadStream(outputFile.path), {
                      filename: `output-${job.id}.zip`,
                      contentType: 'application/zip',
                    });

                    await axios(uploadUrl.toString(), {
                      method: 'POST',
                      data: uploadFormData,
                    });
                  });
                },
                { unsafeCleanup: true },
              );
            },
            { unsafeCleanup: true },
          );

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
