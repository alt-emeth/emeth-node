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
        }
      })
      .middleware([database, wallet, contracts])
      .middleware(logger)
      .middleware(emethStatusWatcher)
      .middleware(jobExecutor)
  },
  handler: async (argv) => {
    const app = express()

    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
      next()
    })

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    const router = express.Router()

    router.post('/api/v1/connect', (req, res, next) => {
      (async () => {
        const worker = await argv.db('workers').where({
          ipAddress: req.body.ipAddress,
          port: req.body.port
        }).first()

        if (worker != null) {
          await argv.db('workers').update({
            batchSize: req.body.batchSize,
            powerCapacity: req.body.powerCapacity
          }).where({
            ipAddress: req.body.ipAddress,
            port: req.body.port
          })
        } else {
          await argv.db('workers').insert({
            ipAddress: req.body.ipAddress,
            port: req.body.port,
            batchSize: req.body.batchSize,
            powerCapacity: req.body.powerCapacity
          })
        }

        res.send({ result: 'OK' })
      })().catch(next)
    })

    app.use(router)

    app.listen(argv.port, () => {
      console.log(`Master listening on port ${argv.port}!`)
    }).timeout = 1000 * 60 * 30
  }
}

export = master
