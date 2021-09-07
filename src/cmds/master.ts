import express from 'express'
import fs from 'fs'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts from '../middlewares/contracts'
import database, { DatabaseMiddlewareArguments } from '../middlewares/database'
import logger, { LoggerMiddlewareArguments } from '../middlewares/logger'
import wallet from '../middlewares/wallet'
import emethStatusWatcher from '../middlewares/emeth-status-watcher'
import jobExecutor from '../middlewares/job-executor'
import cleaner from '../middlewares/cleaner'
import recover from '../middlewares/recover'
import masterApi from '../middlewares/masterApi'
import initData from '../middlewares/init-data'

const master: CommandModule<{
  port: number
} & DatabaseMiddlewareArguments & LoggerMiddlewareArguments,
{
  port: number
} & DatabaseMiddlewareArguments & LoggerMiddlewareArguments> = {
  command: 'master',
  describe: 'Serve as master',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .default('parallelGPTPath', path.resolve(__dirname, '..', '..', 'parallelGPT'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .options({
        port: {
          type: 'number',
          default: 5000,
          description: 'Listen port'
        },
        emethScanInterval: {
          type: 'number',
          default: 1000,
          description: 'emetn event scan interval'
        }
      })
      .middleware([database, wallet, contracts])
      .middleware(logger)
      .middleware(initData)
      .middleware(masterApi)
      .middleware(emethStatusWatcher)
      .middleware(cleaner)
      .middleware(recover)
      .middleware(jobExecutor)
  },
  handler: (argv) => {}
}

export = master
