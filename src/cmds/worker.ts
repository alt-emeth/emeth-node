import axios from 'axios'
import express from 'express'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { Tail } from 'tail'
import makeDir from 'make-dir'
import multer from 'multer'
import { CommandModule } from 'yargs'
import readline from 'readline';

import { MODE } from '../lib/consistants'
import logger, { LoggerMiddlewareArguments } from '../middlewares/logger'
import { clean } from '../lib/storage'

const worker: CommandModule<LoggerMiddlewareArguments & {
  powerCapacity: number
  device: string
  masterIp: string
  myIp: string
  parallelGPTPath: string
}, LoggerMiddlewareArguments & {
  powerCapacity: number
  device: string
  masterIp: string
  myIp: string
  parallelGPTPath: string
}> = {
  command: 'worker',
  describe: 'Serve as worker',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'worker.json'))
      .default('parallelGPTPath', path.resolve(__dirname, '..', '..', 'parallelGPT'))
      .middleware(logger)
  },
  handler: async (argv) => {
    await axios.post(`http://${argv.masterIp}:5000/api/v1/connect`, {
      ipAddress: argv.myIp,
      port: 3000,
      batchSize: argv.batchSize,
      powerCapacity: argv.powerCapacity
    })

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        const destinationPath = path.join(
          argv.parallelGPTPath,
          'split',
          req.body.jobId
        )

        makeDir(destinationPath).then(() => {
          cb(null, destinationPath)
        }).catch(e => {
          cb(e, destinationPath)
        })
      },
      filename: function (req, file, cb) {
        cb(null, file.originalname)
      }
    })

    const upload = multer({ storage: storage })

    let mode = MODE.None
    let child: ChildProcess|null = null
    let currentJobId:string = ""

    const app = express()

    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
      next()
    })

    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    const router = express.Router()

    const isLineReady = (jobId:string, line:string):boolean => {
      argv.logger.debug(`jobId:${jobId}, WN.py is running :${line}`);
      line = line.replace(/\r?\n/g, '');
      let json = null;
      try {
        json = JSON.parse(line);
      } catch (e) {}
      if (json && json.status == 'READY') {
        return true;
      }
      return false;
    }

    const isScanedLogReady = (jobId:string, log_file:string) => {
      return new Promise<boolean>((resolve, reject) => {
        let isReady = false;
        const rs = fs.createReadStream(log_file);
        const rl = readline.createInterface({
          input: rs,
          output: process.stdout,
          terminal: false,
        });
        rl.on('line', (line) => {
          if(!isReady) isReady = isLineReady(jobId, line);
        })
        rl.on('close', () => {
          resolve(isReady);
        })
      });
    }

    router.post('/api/v1/ready', (req, res, next) => {
      (async () => {
        const jobId = req.body.jobId as string
        const trainDataFile = path.join(argv.parallelGPTPath,'split', jobId, req.body.train_data_file)
        const testDataFile = path.join(argv.parallelGPTPath,'split', jobId, req.body.test_data_file)
        const outputDir = path.join(argv.parallelGPTPath,'model', jobId) + '/'
        const masterPort = req.body.master_port as string
        const batchSize = req.body.batchSize as string
        const n_epochs = req.body.n_epochs as string
        const num_workers = req.body.num_workers as string
        const rank = req.body.rank as string
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
        const args = [
          'WN.py',
          '--train_data_file', trainDataFile,
          '--output_dir', outputDir,
          '--rank', rank,
          '--master_ip', argv.masterIp,
          '--master_port', masterPort,
          '--log_file', logFile,
          '--timeout', '300',
          '--test_data', testDataFile,
          '--train_batch_size', batchSize.toString(),
          '--device', argv.device,
          '--n_epochs', n_epochs.toString(),
          '--dataset_cache', datasetCache,
          '--num_workers', num_workers.toString()
        ]

        child = spawn('python3', args, {
          cwd: argv.parallelGPTPath,
          stdio: 'inherit'
        })

        argv.logger.debug('Exec python process. command: python3 ' + args.join(' '))

        while(true) {
          if(fs.existsSync(logFile)) {
            break;
          }
        }
        isScanedLogReady(jobId, logFile).then((isReady) => {
          if(isReady && mode == MODE.Ready) {
            argv.logger.debug(`WN.py is ready. Change mode to ${MODE.Idle}`);
            mode = MODE.Idle;
          }
        });
        const tail = new Tail(logFile);
        argv.logger.debug(`jobId:${jobId}, tail start :${logFile}`);
        tail.on('line', async(line) => {
          if(isLineReady(jobId, line) && mode == MODE.Ready) {
            argv.logger.debug(`WN.py is ready. Change mode to ${MODE.Idle}`);
            mode = MODE.Idle;
          };
        });
        tail.on('error', argv.logger.error)
        tail.watch();
  
        child.on('close', () => {
          argv.logger.debug('Process closed.')
          tail.unwatch()
  
          argv.logger.info(`Change mode to:${MODE.None}`)
          mode = MODE.None
  
          child = null

          currentJobId = ""
        })

        argv.logger.info(`Change mode to:${MODE.Ready}`)
        mode = MODE.Ready

        currentJobId = jobId

        res.send({ result: mode })
      })().catch(next)
    })

    router.post('/api/v1/kill', (req, res) => {
      if (child !== null) {
        child.kill(9)
        child = null
        argv.logger.info('Process killed')
      }

      argv.logger.info(`Change mode to:${MODE.None}`)
      mode = MODE.None

      currentJobId = ""

      res.send({ result: mode })
    })

    router.post('/api/v1/waitData', (req, res) => {
      mode = MODE.WaitData
      res.send({ result: mode })
    })

    router.get('/api/v1/mode', (req, res) => {
      res.send({ result: mode })
    })

    router.get('/api/v1/currentJob', (req, res) => {
      res.send({ result: currentJobId })
    })

    router.post('/api/v1/upload', upload.single('file'), (req, res) => {
      res.send('Uploaded successfully :' + req.file.originalname)
    })

    router.post('/api/v1/clean', (req, res) => {
      clean(req.body.jobId, argv.parallelGPTPath, argv.logger)
      res.send({ result: 'OK' })
    })

    app.use(router)

    app.listen(3000, () => {
      argv.logger.info('Worker listening on port 3000')
    }).timeout = 1000 * 60 * 30
  }
}

export = worker
