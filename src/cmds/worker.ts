import express, { NextFunction } from 'express'
import fs, { stat } from 'fs'
import path from 'path'
import makeDir from 'make-dir'
import multer from 'multer'
import { CommandModule } from 'yargs'

import logger, { LoggerMiddlewareArguments } from '../middlewares/logger'
import { clean } from '../lib/storage'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import exitHandler, { ExitHandlerMiddlewareArguments, ProcessHolder } from '../middlewares/exit-handler'
import workerProcesser, { WorkerProcesser, WorkerProcesserMiddlewareArguments } from '../middlewares/worker/processer'
import workerConnector from '../middlewares/worker/connector'
import AccessControl from 'express-ip-access-control'
import { verify } from '../lib/crypto'
import { ParamsDictionary, Request, Response } from 'express-serve-static-core'
import QueryString from 'qs'
import { IAuth } from '../types/api'

const AUTH_EXPIRE = 1000*60

const worker: CommandModule<LoggerMiddlewareArguments & WalletMiddlewareArguments & ExitHandlerMiddlewareArguments & WorkerProcesserMiddlewareArguments & {
  powerCapacity: number
  device: string
  master_node_url: string
  masterAddress:string
  parallelGPTPath: string
  processHolder: ProcessHolder
  workerProcesser: WorkerProcesser
}, LoggerMiddlewareArguments & WalletMiddlewareArguments & ExitHandlerMiddlewareArguments & WorkerProcesserMiddlewareArguments & {
  powerCapacity: number
  device: string
  master_node_url: string
  masterAddress:string
  parallelGPTPath: string
  processHolder: ProcessHolder
  workerProcesser: WorkerProcesser
}> = {
  command: 'worker',
  describe: 'Serve as worker',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'worker.json'))
      .default('parallelGPTPath', path.resolve(__dirname, '..', '..', 'parallelGPT'))
      .default('generatedUIDPath', path.resolve(__dirname, '..', '..', 'generated-uid', 'account.json'))
      .string(['privateKey'])
      .middleware(logger)
      .middleware(wallet)
      .middleware(exitHandler)
      .middleware(workerProcesser)
      .middleware(workerConnector)
  },
  handler: async (argv) => {
    const logger = argv.logger
    const port = new URL(argv.my_url as string).port

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        try {
          const data = JSON.parse(req.body.data)
  
          if(!isMasterAccess(data.auth as IAuth)) {
            cb(new Error('Unauthorized'), '')
            return
          }
  
          const destinationPath = path.join(
            argv.parallelGPTPath,
            'split',
            data.jobId
          )
  
          makeDir(destinationPath).then(() => {
            cb(null, destinationPath)
          }).catch(e => {
            cb(e, destinationPath)
          })
        } catch (e:any) {
          cb(e, '')
        }
      },
      filename: function (req, file, cb) {
        cb(null, file.originalname)
      }
    })

    const upload = multer({ storage: storage })

    const app = express()

    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
      next()
    })

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    const isMasterAccess = (auth:IAuth):boolean => {
      const {sig, timestamp} = auth
      if(new Date().getTime() - timestamp > AUTH_EXPIRE) {
        return false
      } else if(verify(['uint256'], [timestamp], argv.masterAddress, sig)) {
        return true
      } else {
        return false
      }
    }

    const checkMasterAccess = (
      req:Request<ParamsDictionary, any, any, QueryString.ParsedQs, Record<string, any>>, 
      res:Response<any, Record<string, any>, number>, 
      next:NextFunction
      ) => {
      if(!isMasterAccess(req.body.auth as IAuth)) {
        res.status(401).send('Unauthorized')
      } else {
        next()
      }
    }

    const router = express.Router()

    router.post('/api/v1/process', checkMasterAccess, (req, res, next) => {
      (async () => {
        const jobId = req.body.jobId as string
        const trainDataFile = path.join(argv.parallelGPTPath,'split', jobId, req.body.train_data_file)
        const testDataFile = path.join(argv.parallelGPTPath,'split', jobId, req.body.test_data_file)
        const outputDir = path.join(argv.parallelGPTPath,'model', jobId) + '/'
        const masterPort = req.body.master_port as number
        const batchSize = req.body.batchSize as number
        const n_epochs = req.body.n_epochs as number
        const num_workers = req.body.num_workers as number
        const rank = req.body.rank as number
        const timeLimit = req.body.timeLimit as number
        const logFile = path.join(argv.parallelGPTPath, 'wn_log', `${jobId}.log`)

        await makeDir(path.dirname(logFile))
        const datasetCache = path.join(argv.parallelGPTPath, 'dataset_cache', jobId)
        await makeDir(path.dirname(datasetCache));
        if(fs.existsSync(logFile)) {
          fs.unlinkSync(logFile)
        }
        if(fs.existsSync(datasetCache)) {
          fs.unlinkSync(datasetCache)
        }

        argv.workerProcesser.process(
          jobId,
          argv.parallelGPTPath,
          logger,
          argv.processHolder,
          trainDataFile,
          outputDir,
          rank,
          argv.master_node_url,
          masterPort,
          logFile,
          timeLimit,
          testDataFile,
          batchSize,
          argv.device,
          n_epochs,
          datasetCache,
          num_workers
        )
        res.send({ result: argv.workerProcesser.mode })
      })().catch(next)
    })

    router.post('/api/v1/init', checkMasterAccess, (req, res) => {
      argv.workerProcesser.none(logger)

      argv.workerProcesser.clean(argv.processHolder)

      res.send({ result: argv.workerProcesser.mode })
    })

    router.post('/api/v1/waitData', checkMasterAccess, (req, res) => {
      argv.workerProcesser.waitData(argv.logger)
      res.send({ result: argv.workerProcesser.mode })
    })

    router.get('/api/v1/mode', (req, res) => {
      res.send({ result: argv.workerProcesser.mode })
    })

    router.get('/api/v1/isRunning', (req, res) => {
      res.send({ result: argv.workerProcesser.isRunning()})
    })

    router.get('/api/v1/currentJobId', (req, res) => {
      res.send({ result: argv.workerProcesser.jobId })
    })

    router.post('/api/v1/upload', upload.single('file'), (req, res) => {
      res.send('Uploaded successfully :' + req.file.originalname)
    })

    router.post('/api/v1/clean', checkMasterAccess, (req, res) => {
      clean(req.body.jobId, argv.parallelGPTPath, argv.logger)
      res.send({ result: 'OK' })
    })

    app.use(router)

    app.listen(port, () => {
      argv.logger.info(`Worker listening on port ${port}`)
    }).timeout = 1000 * 60 * 30
  }
}

export = worker

