import * as fs from 'fs';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandRunner, Option, RootCommand } from 'nest-commander';
import {
  clearIntervalAsync,
  setIntervalAsync as setIntervalAsyncDynamic,
} from 'set-interval-async/dynamic';
import { setTimeout } from 'timers/promises';
import * as tmp from 'tmp-promise';

import {
  EmethCacheService,
  EmethContractsService,
  EmethStorageService,
  EmethWalletService,
} from './emeth';

import { ProcessorService } from './processor.service';

interface WorkerCommandOptions {
  excludeProcessor: number[];
  includeProcessor: number[];
  interval: number;
  iterations: number;
}

@RootCommand({
  name: 'worker',
})
export class WorkerCommand extends CommandRunner {
  private readonly logger = new Logger(WorkerCommand.name);

  constructor(
    @Inject(ConfigService)
    private configService: ConfigService,
    @Inject(EmethCacheService)
    private emethCacheService: EmethCacheService,
    @Inject(EmethContractsService)
    private emethContractsService: EmethContractsService,
    @Inject(EmethStorageService)
    private emethStorageService: EmethStorageService,
    @Inject(EmethWalletService)
    private emethWalletService: EmethWalletService,
    @Inject(ProcessorService)
    private processorService: ProcessorService,
  ) {
    super();
  }

  async run(
    passedParams: string[],
    options?: WorkerCommandOptions,
  ): Promise<void> {
    if (options.excludeProcessor && options.includeProcessor) {
      console.error(
        `error: option '--include-processor' cannot be used with '--exclude-processor'`,
      );
    }

    let iterations = options.iterations;

    this.logger.log(
      `Monitoring cache server at ${options.interval / 1000}s intervals...`,
    );

    const timer = setIntervalAsyncDynamic(async () => {
      try {
        let job = await this.chooseJobToProcess(
          options.includeProcessor,
          options.excludeProcessor,
        );

        if (!job) {
          return;
        }

        const param = job.param ? JSON.parse(job.param) : {};

        const isDirect = param.datasetType && param.datasetType == 'direct';

        this.logger.log(`[Job ID:${job.id}] Starting to process...`);

        const allowance = await this.emethContractsService
          .getEmethTokenContract()
          .allowance(
            this.emethWalletService.getWallet().address,
            this.emethContractsService.getEmethCoreContractAddress(),
          );

        if (allowance.lt(job.fuelLimit * job.fuelPrice)) {
          this.logger.log(
            `[Job ID:${job.id}] Approving spending ${
              job.fuelLimit * job.fuelPrice
            } Emeth Token to Emeth Core...`,
          );

          await (
            await this.emethContractsService
              .getEmethTokenContract()
              .approve(
                this.emethContractsService.getEmethCoreContractAddress(),
                job.fuelLimit * job.fuelPrice,
              )
          ).wait();
        }

        if (!isDirect) {
          await (
            await this.emethContractsService
              .getEmethCoreContract()
              .process(job.id)
          ).wait();

          this.logger.log(
            `[Job ID:${job.id}] Waiting cache server to update...`,
          );

          job = await this.waitJobForProcessingStatus(job.id);
        }

        await tmp.withFile(
          async (inputFile) => {
            await tmp.withDir(
              async (inputDir) => {
                if (!isDirect) {
                  this.logger.log(
                    `[Job ID:${job.id}] Downloading dataset from storage...`,
                  );

                  await this.emethStorageService.download(
                    job.id,
                    'input',
                    inputDir.path,
                  );
                } else {
                  await fs.promises.writeFile(
                    inputFile.path,
                    job.dataset,
                    'utf-8',
                  );
                }

                await tmp.withDir(
                  async (outputDir) => {
                    await tmp.withFile(
                      async (outputFile) => {
                        this.logger.log(
                          `[Job ID:${job.id}] Running processor container for program ID: ${job.programId}...`,
                        );

                        const exitCode =
                          await this.processorService.runProcessor(
                            job,
                            !isDirect ? inputDir.path : inputFile.path,
                            !isDirect ? outputDir.path : outputFile.path,
                            { enableGpu: this.configService.get('enableGpu') },
                          );

                        if (exitCode != 0) {
                          this.logger.error(
                            `[Job ID:${job.id}] Container returned exit code ${exitCode}.`,
                          );

                          return;
                        }

                        let result;

                        if (!isDirect) {
                          this.logger.log(
                            `[Job ID:${job.id}] Uploading output to storage...`,
                          );

                          result = await this.emethStorageService.upload(
                            job.id,
                            'output',
                            outputDir.path,
                          );
                        } else {
                          result = (
                            await fs.promises.readFile(outputFile.path, 'utf-8')
                          ).replace(/[\r\n]+$/, '');
                        }

                        this.logger.log(
                          `[Job ID:${job.id}] Submitting the result...`,
                        );

                        await (
                          await this.emethContractsService
                            .getEmethCoreContract()
                            .submit(job.id, result, job.fuelLimit)
                        ).wait();
                      },
                      { unsafeCleanup: true },
                    );
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
        this.logger.error(e);
      }

      if (!--iterations) {
        (async () => {
          clearIntervalAsync(timer);
        })();
      }
    }, options.interval);
  }

  @Option({
    flags: '--interval <number>',
    defaultValue: 10000,
  })
  parseInterval(value: string) {
    return Number(value);
  }

  @Option({
    flags: '--iterations <number>',
    defaultValue: Infinity,
  })
  parseIterations(value: string) {
    return Number(value);
  }

  @Option({
    flags: '--include-processor,--includeProcessor <numbers...>',
    description: 'include processor with specified program ID(s)',
    env: 'EMETH_NODE_INCLUDE_PROCESSOR',
  })
  parseIncludeProcessors(option: string, optionsAccumulator: number[] = []) {
    return this.parseProcessors(option, optionsAccumulator);
  }

  @Option({
    flags: '--exclude-processor,--excludeProcessor <numbers...>',
    description: 'exclude processor with specified program ID(s)',
    env: 'EMETH_NODE_EXCLUDE_PROCESSOR',
  })
  parseExcludeProcessors(option: string, optionsAccumulator: number[] = []) {
    return this.parseProcessors(option, optionsAccumulator);
  }

  private parseProcessors(option: string, optionsAccumulator: number[] = []) {
    option.split(/,/).map((programId: string) => {
      if (!programId.match(/^[0-9]+$/)) {
        throw new Error(`Specified program ID: '${programId}' is invalid.`);
      }

      optionsAccumulator.push(Number(programId));
    });

    return optionsAccumulator;
  }

  private async chooseJobToProcess(
    includeProcessor: number[],
    excludeProcessor: number[],
  ) {
    const jobs = await this.emethCacheService.getRequestedJobs();

    const processableJobs = jobs.filter((job) => {
      if (job.numParallel != 1) {
        return false;
      } else if (includeProcessor) {
        if (!includeProcessor.includes(job.programId)) {
          return false;
        }
      } else if (excludeProcessor) {
        if (excludeProcessor.includes(job.programId)) {
          return false;
        }
      }

      return true;
    });

    if (processableJobs.length == 0) {
      return undefined;
    }

    processableJobs.sort((job1: any, job2: any) => {
      return job2.fuelLimit * job2.fuelPrice - job1.fuelLimit * job1.fuelPrice;
    });

    return processableJobs[Math.floor(Math.random() * processableJobs.length)];
  }

  private async waitJobForProcessingStatus(jobId: string) {
    while (true) {
      const job = await this.emethCacheService.getJob(jobId);

      if (job.id == jobId && job.status == 2 /* PROCESSING */) {
        return job;
      }

      await setTimeout(10000);
    }
  }
}
