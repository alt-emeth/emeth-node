import AdmZip from 'adm-zip';
import axios from 'axios';
import fs from 'fs';
import interval from 'interval-promise';
import path from 'path';
import { setTimeout } from 'timers/promises';
import stream from 'stream';
import tmp from 'tmp-promise';
import { CommandModule } from 'yargs';
import { zip } from 'zip-a-folder';

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts';
import logger, { LoggerMiddlewareArguments } from '../middlewares/logger';
import processors, { ProcessorsMiddlewareArguments } from '../middlewares/processors';
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet';

const worker: CommandModule<
  LoggerMiddlewareArguments &
    ContractsMiddlewareArguments &
    WalletMiddlewareArguments &
    ProcessorsMiddlewareArguments & {
      cacheServerUrl: string;
      enableGpu: boolean;
      excludeProcessor?: number[];
      interval: number;
      includeProcessor?: number[];
      iterations?: number;
      emethCoreContractAddress: string;
      storageApiUrl: string;
    },
  LoggerMiddlewareArguments &
    ContractsMiddlewareArguments &
    WalletMiddlewareArguments &
    ProcessorsMiddlewareArguments & {
      cacheServerUrl: string;
      enableGpu: boolean;
      excludeProcessor?: number[];
      interval: number;
      includeProcessor?: number[];
      iterations?: number;
      emethCoreContractAddress: string;
      storageApiUrl: string;
    }
> = {
  command: ['worker', '$0'],
  describe: 'Serve as worker',
  builder: (yargs) => {
    return yargs
      .env('EMETH_NODE')
      .config('config', (configPath) => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.join(path.dirname(process.argv[1]), 'config', 'emeth-node.json'))
      .string(['privateKey', 'emethCoreContractAddress', 'emethTokenContractAddress'])
      .default(
        'generatedUIDPath',
        path.resolve(__dirname, '..', '..', 'generated-uid', 'account.json'),
      )
      .default('interval', 10000)
      .number(['interval', 'iterations'])
      .option('excludeProcessor', {
        alias: 'exclude-processor',
        array: true,
        conflicts: 'includeProcessor',
        describe: 'exclude processor with specified program ID(s)',
        string: true,
      })
      .option('includeProcessor', {
        alias: 'include-processor',
        array: true,
        conflicts: 'excludeProcessor',
        describe: 'include processor with specified program ID(s)',
        string: true,
      })
      .coerce(['excludeProcessor', 'includeProcessor'], (arg) => {
        return arg
          .map((prgoramIds: string) => {
            return prgoramIds.split(/,/);
          })
          .flat()
          .map((prgoramId: string) => {
            if (prgoramId.match(/^[0-9]+$/)) {
              return Number(prgoramId);
            } else {
              throw new Error(`Specified program ID: '${prgoramId}' is invalid.`);
            }
          });
      })
      .middleware(wallet)
      .middleware(contracts)
      .middleware(processors)
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
            if (job.numParallel != 1) {
              return false;
            } else if (argv.includeProcessor) {
              if (!argv.includeProcessor.includes(job.programId)) {
                return false;
              }
            } else if (argv.excludeProcessor) {
              if (argv.excludeProcessor.includes(job.programId)) {
                return false;
              }
            }

            return true;
          });

          if (jobs.length == 0) {
            return;
          }

          jobs.sort((job1: any, job2: any) => {
            return job2.fuelLimit * job2.fuelPrice - job1.fuelLimit * job1.fuelPrice;
          });

          let job = jobs[Math.floor(Math.random() * jobs.length)];

          const param = job.param ? JSON.parse(job.param) : {};

          const isDirect = param.datasetType && param.datasetType == 'direct';

          if (!isDirect) {
            logger.info(`[Job ID:${job.id}] Starting to process...`);

            const allowance = await argv.contracts.emethToken.allowance(
              argv.wallet.address,
              argv.emethCoreContractAddress,
            );

            if (allowance.lt(job.fuelLimit * job.fuelPrice)) {
              logger.info(
                `[Job ID:${job.id}] Approving spending ${
                  job.fuelLimit * job.fuelPrice
                } Emeth Token to Emeth Core...`,
              );

              await (
                await argv.contracts.emethToken.approve(
                  argv.emethCoreContractAddress,
                  job.fuelLimit * job.fuelPrice,
                )
              ).wait();
            }

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
          }

          await tmp.withFile(
            async (inputFile) => {
              await tmp.withDir(
                async (inputDir) => {
                  if (!isDirect) {
                    logger.info(`[Job ID:${job.id}] Getting presigned download URL...`);

                    const signature = await argv.wallet.signMessage(job.id);

                    const downloadApiUrl = new URL('download', argv.storageApiUrl);
                    downloadApiUrl.searchParams.append('jobId', job.id);
                    downloadApiUrl.searchParams.append('type', 'input');
                    downloadApiUrl.searchParams.append('signature', signature);

                    const downloadApiResponse = await axios(downloadApiUrl.toString());

                    logger.info(`[Job ID:${job.id}] Downloading dataset from storage...`);

                    const writer = fs.createWriteStream(inputFile.path);

                    await axios(downloadApiResponse.data.downloadUrl, {
                      responseType: 'stream',
                    }).then((response) => {
                      response.data.pipe(writer);

                      return stream.promises.finished(writer);
                    });

                    logger.info(`[Job ID:${job.id}] Unzipping dataset...`);

                    const admZip = new AdmZip(inputFile.path);

                    await new Promise<void>((resolve, reject) => {
                      admZip.extractAllToAsync(inputDir.path, false, false, (error) => {
                        if (error) {
                          reject(error);
                        } else {
                          resolve();
                        }
                      });
                    });
                  } else {
                    await fs.promises.writeFile(inputFile.path, job.dataset, 'utf-8');
                  }

                  await tmp.withDir(
                    async (outputDir) => {
                      await tmp.withFile(async (outputFile) => {
                        logger.info(
                          `[Job ID:${job.id}] Running processor container for program ID: ${job.programId}...`,
                        );

                        const exitCode = await argv.processors.run(
                          job,
                          isDirect ? inputFile.path : inputDir.path,
                          isDirect ? outputFile.path : outputDir.path,
                          argv,
                        );

                        if (exitCode != 0) {
                          logger.error(
                            `[Job ID:${job.id}] Container returned exit code ${exitCode}.`,
                          );

                          return;
                        }

                        let result;

                        if (isDirect) {
                          result = (await fs.promises.readFile(outputFile.path, 'utf-8')).replace(
                            /[\r\n]+$/,
                            '',
                          );
                        } else {
                          logger.info(`[Job ID:${job.id}] Zipping output...`);

                          await zip(outputDir.path, outputFile.path);

                          logger.info(`[Job ID:${job.id}] Uploading output to storage...`);

                          let outputFileHandle: fs.promises.FileHandle | null = null;
                          try {
                            // each part is 5MiB
                            const partSize = 5 * 1024 * 1024;

                            logger.info(`[Job ID:${job.id}] Getting presigned upload URLs...`);

                            const uploadPresignedUrlApiUrl = new URL(
                              'upload/presigned-url',
                              argv.storageApiUrl,
                            );

                            const uploadPresignedUrlApiResponse = await axios(
                              uploadPresignedUrlApiUrl.toString(),
                              {
                                method: 'POST',
                                data: {
                                  type: 'output',
                                  jobId: job.id,
                                  parts: Math.ceil(fs.statSync(outputFile.path).size / partSize),
                                },
                              },
                            );

                            const {
                              fileName,
                              uploadId,
                              preSignedUrls,
                            }: {
                              fileName: string;
                              uploadId: string;
                              preSignedUrls: { part: number; url: string }[];
                            } = uploadPresignedUrlApiResponse.data;

                            outputFileHandle = await fs.promises.open(outputFile.path);

                            const parts = [];
                            const buffer = Buffer.alloc(partSize);

                            for (const preSignedUrl of preSignedUrls) {
                              logger.info(
                                `[Job ID:${job.id}] Uploading part #${preSignedUrl.part}...`,
                              );

                              const { bytesRead } = await outputFileHandle.read(
                                buffer,
                                0,
                                partSize,
                                (preSignedUrl.part - 1) * partSize,
                              );

                              const uploadPartResponse = await axios(preSignedUrl.url, {
                                method: 'PUT',
                                data: buffer,
                                headers: {
                                  'Content-Type': 'application/octet-stream',
                                  'Content-Length': bytesRead,
                                },
                              });

                              parts.push({
                                ETag: uploadPartResponse.headers['etag'].replaceAll('"', ''),
                                PartNumber: preSignedUrl.part,
                              });
                            }

                            logger.info(`[Job ID:${job.id}] Completing upload...`);

                            const uploadCompleteApiUrl = new URL(
                              'upload/complete',
                              argv.storageApiUrl,
                            );

                            await axios(uploadCompleteApiUrl.toString(), {
                              method: 'POST',
                              data: {
                                fileName: fileName,
                                uploadId: uploadId,
                                parts: parts,
                              },
                            });

                            result = path.basename(fileName);
                          } finally {
                            await outputFileHandle?.close();
                          }
                        }

                        logger.info(`[Job ID:${job.id}] Submitting the result...`);

                        await (
                          await argv.contracts.emethCore.submit(job.id, result, job.fuelLimit)
                        ).wait();
                      });
                    },
                    { unsafeCleanup: true },
                  );
                },
                { unsafeCleanup: true },
              );
            },
            { unsafeCleanup: true },
          );
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
