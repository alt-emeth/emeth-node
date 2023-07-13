import fs from 'fs';
import path from 'path';
import { CommandModule } from 'yargs';

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts';
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet';
import database, { DatabaseMiddlewareArguments } from '../middlewares/database';
import { exit } from 'process';
import { Knex } from 'knex';
import { JobStatus } from '../types/tables';
import { Wallet } from '@ethersproject/wallet';
import axios from 'axios';

let db: Knex;

const decline: CommandModule<
  {} & ContractsMiddlewareArguments & WalletMiddlewareArguments & DatabaseMiddlewareArguments,
  {} & ContractsMiddlewareArguments & WalletMiddlewareArguments & DatabaseMiddlewareArguments
> = {
  command: 'decline',
  describe: 'decline job',
  builder: (yargs) => {
    return yargs
      .config('config', (configPath) => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([database, wallet, contracts])
      .middleware((args) => {
        db = args.db;
      })
      .onFinishCommand((): void => {
        // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
        return (db.destroy() as unknown) as void;
      });
  },
  handler: async (args) => {
    const { emethCore } = args.contracts;
    const wallet = args.wallet as Wallet;

    if (process.argv[3] != null) {
      const jobId = process.argv[3];
      const emethJob = await emethCore.jobs(jobId);

      console.log(`Current job status:${emethJob.status}`);

      if (emethJob.status.eq(JobStatus.PROCESSING)) {
        await emethCore.decline(jobId);
        console.log(`Declined job:${jobId}`);
      }

      exit();
    }

    const jobs = await db('jobs').where('status', JobStatus.PROCESSING);

    for (let i = 0; i < jobs.length; i++) {
      try {
        const job = jobs[i];

        console.log(`Processing job:${job.job_id}`);

        const emethJob = await emethCore.jobs(job.job_id);

        console.log(`Current job status:${emethJob.status}`);

        if (emethJob.status.eq(JobStatus.PROCESSING)) {
          await emethCore.decline(job.job_id);
          console.log(`Declined job:${job.job_id}`);
        }
      } catch (e) {
        console.log(e);
      }
    }

    exit();
  },
};

export = decline;
