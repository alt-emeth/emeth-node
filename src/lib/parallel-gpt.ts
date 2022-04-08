import { ChildProcess, spawn } from 'child_process'
import { EventEmitter2 } from 'eventemitter2'
import fs from 'fs'
import { Logger } from 'log4js'
import path from 'path'
import { Tail } from 'tail'
import makeDir from 'make-dir'
import { Emeth } from '../types/contracts'
import { Knex } from 'knex'
import interval from 'interval-promise'
import axios from 'axios'
import { Worker } from '../types/tables'
import { ProcessHolder } from '../middlewares/exit-handler'
import { MODE } from './consistants'
import readline from 'readline'

const nullLogger = {
  info: () => {},
  log: () => {},
  error: () => {},
  warn: () => {}
}

export const extractCompletedJson = (log_file:string) => {
  return new Promise((resolve, reject) => {
    let res:any = null
    const rs = fs.createReadStream(log_file)
    const rl = readline.createInterface({
      input: rs,
      output: process.stdout,
      terminal: false,
    })
    rl.on('line', (line) => {
      line = line.replace(/\r?\n/g, '')
      let json = null
      try {
        json = JSON.parse(line)
      } catch (e) {}
      if (json && json.status == 'COMPLETED') {
        res = json
      }
    })
    rl.on('close', () => {
      resolve(res)
    })
  })
}

export async function execSplitter (
  trainDataFile: string,
  splitDataDir: string,
  numOfWorkers: number,
  language: string,
  options: {
    logger?: Logger
    parallelGPTPath?: string
  }): Promise<void> {
  const logger = options.logger != null ? options.logger : nullLogger
  const parallelGPTPath = options.parallelGPTPath != null ? options.parallelGPTPath : './'

  const args = [
    'splitter.py',
    '--train_data_file', trainDataFile,
    '--output_dir', splitDataDir,
    '--language', language,
    '--num_worker', numOfWorkers.toString()
  ]

  logger.info('Execute python3. command:' + args.join(' '))

  const child = spawn('python3', args, {
    cwd: parallelGPTPath,
    stdio: 'ignore'
  })

  await new Promise<void>((resolve, reject) => {
    child.on('exit', () => {
      resolve()
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

declare interface IMasterNode {
  addListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this) & ((event: 'suspend', listener: (jobId: string, error: Error) => void|Promise<void>) => this) & ((event: 'workerCompleted', listener: (jobId:string, worker:Worker) => void|Promise<void>) => this)
  emit: ((event: 'completed') => boolean) & ((event: 'error', error: Error) => boolean) & ((event: 'suspend') => boolean) & ((event: 'workerCompleted') => boolean)
  on: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this) & ((event: 'suspend', listener: (jobId:string, error: Error) => void|Promise<void>) => this) & ((event: 'workerCompleted', listener: (jobId:string, worker: Worker) => void|Promise<void>) => this)
  once: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this) & ((event: 'suspend', listener: (jobId:string, error: Error) => void|Promise<void>) => this) & ((event: 'workerCompleted', listener: (jobId:string, worker: Worker) => void|Promise<void>) => this)
  prependListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this) & ((event: 'suspend', listener: (jobId:string, error: Error) => void|Promise<void>) => this) & ((event: 'workerCompleted', listener: (jobId:string, worker: Worker) => void|Promise<void>) => this)
  prependOnceListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this) & ((event: 'suspend', listener: (jobId:string, error: Error) => void|Promise<void>) => this) & ((event: 'workerCompleted', listener: (jobId:string, worker: Worker) => void|Promise<void>) => this)
  removeListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this) & ((event: 'suspend', listener: (jobId:string, error: Error) => void|Promise<void>) => this) & ((event: 'workerCompleted', listener: (jobId:string, worker: Worker) => void|Promise<void>) => this)
}

export async function launchMasterNode (
  jobId: string,
  trainDataFile: string,
  outputDir: string,
  workerIpListFile: string,
  masterPort: number,
  my_url: string,
  timeout: number,
  testData: string,
  trainBatchSize: number,
  device: string,
  n_epochs: number,
  datasetCache: string,
  language:string,
  usedWorkers: Worker[],
  logger: Logger,
  parallelGPTPath: string
  ): Promise<{masterNode: IMasterNode, child:ChildProcess}> {

  const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)
  await makeDir(path.dirname(logFile))

  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile)
  }
  if(fs.existsSync(datasetCache)) {
    fs.unlinkSync(datasetCache)
  }

  const emitter = new EventEmitter2()

  const masterIp = new URL(my_url).hostname

  // launch MN.py
  const args = [
    'dist/MN.py',
    '--train_data_file', trainDataFile, // path.join(splitDataDir, 'train1.txt'),
    '--output_dir', outputDir,
    '--worker_ip_list', workerIpListFile,
    '--master_port', masterPort.toString(),
    '--master_ip', masterIp,
    '--log_file', logFile,
    '--timeout', timeout.toString(), // jobAssign.timeLimit,
    '--test_data', testData,
    '--train_batch_size', trainBatchSize.toString(),
    '--device', device,
    '--n_epochs', n_epochs.toString(),
    '--dataset_cache', datasetCache,
    '--num_workers', usedWorkers.length.toString(),
    '--language', language
  ]

  logger.info(`Execute python3. command: python3 ${args.join(' ')}`)

  const child = spawn('python3', args,
    {
      cwd: parallelGPTPath,
      stdio: 'inherit'
    })

  while (true) {
    if (fs.existsSync(logFile)) {
      break
    }
  }

  const tail = new Tail(logFile)

  let completed = false
  child.on('error', (err) => {
    emitter.emit('error', err)
    tail.unwatch()
  })

  child.on('exit', (code) => {
    if (!completed) {
      emitter.emit('error', new Error(`JobId:${jobId}, MN.py unexpectedly exited with code ${code}`))
    }
    tail.unwatch()
  })

  tail.on('line', (line: string) => {
    logger.info(`JobId:${jobId}, MN.py is running :${line}`)

    try {
      const json = JSON.parse(line)

      if (json.status === 'COMPLETED' && !completed) {
        logger.info(`JobId:${jobId}, MN.py has completed`)

        completed = true
        emitter.emitAsync('completed', json.fileName)
      }
    } catch (e) { }
  })

  tail.watch()

  logger.info(`JobId:${jobId}, Monitoring workers state.`)

  interval(async(iteration, stop) => {
    if(completed) {
      stop()
      return
    }

    try {
      let completedWorkers:Worker[] = []

      for(const worker of usedWorkers) {
        const isRunning = (await axios.get(`${worker.url}/api/v1/isRunning`)).data.result

        if(!isRunning) {
          if((await axios.get(`${worker.url}/api/v1/mode`)).data.result == MODE.COMPLETED) {
            logger.info(`JobId:${jobId}, Complete Worker process :${worker.url}`)

            completedWorkers.push(worker)

            emitter.emitAsync('workerCompleted', jobId, worker)

            continue
          }

          throw new Error(`JobId:${jobId}, Suspended Worker process :${worker.url}`)
        }

        const currentJobId = (await axios.get(`${worker.url}/api/v1/currentJobId`)).data.result

        if(currentJobId !== jobId) {
          throw new Error(`JobId:${jobId}, Processing jobId in the worker is different. worker:${worker.url}, processingJobId: ${currentJobId}`)
        }
      }

      if(completedWorkers.length > 0) {
        usedWorkers = usedWorkers.filter((worker) => {
          return !completedWorkers.includes(worker)
        })
      }

    } catch(e) {
      emitter.emitAsync('suspend', jobId, e)
      child.kill(9)
      stop()
    }
  }, 1000, {
    stopOnError:false
  }) as unknown as void

  return {masterNode: emitter as IMasterNode, child}
}

export async function generateArgFiles(parallelGPTPath:string, jobId:string, jobDetail: ReturnType<Emeth['jobDetails']> extends Promise<infer T> ? T : never) {
  const trainDataDir = path.join(parallelGPTPath, 'data', jobId)
  const splitDataDir = path.join(parallelGPTPath, 'split', jobId)
  const outputDir = path.join(parallelGPTPath, 'model', jobId)
  const workerIpListDir = path.join(parallelGPTPath, 'worker_ip_list')
  const datasetCacheDir = path.join(parallelGPTPath, 'dataset_cache')
  await makeDir(trainDataDir)
  await makeDir(splitDataDir)
  await makeDir(outputDir)
  await makeDir(workerIpListDir)
  await makeDir(datasetCacheDir)
  const trainDataFile = path.join(trainDataDir, jobDetail.dataset)
  const workerIpListFile = path.join(workerIpListDir, `${jobId}.txt`)
  const datasetCache = path.join(datasetCacheDir, jobId)

  return {outputDir, splitDataDir, trainDataFile, workerIpListFile, datasetCache}
}

export const randomPort = async(processHolder:ProcessHolder, exclude:number[] = []):Promise<number> => {
  if(exclude.length == 0) {
    exclude = Object.keys(processHolder.processes).map((key) => { return processHolder.processes[key].masterport })
  }

  const rand = Math.floor(Math.random() * (65535 - 8000 + 1) + 8000)

  if(exclude.includes(rand)) {
    return randomPort(processHolder, exclude)
  }

  return rand;
}