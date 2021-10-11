import archiver from 'archiver'
import { spawn } from 'child_process'
import { EventEmitter2 } from 'eventemitter2'
import fs from 'fs'
import { Logger } from 'log4js'
import path from 'path'
import { Tail } from 'tail'
import makeDir from 'make-dir'

const nullLogger = {
  info: () => {},
  log: () => {},
  error: () => {},
  warn: () => {}
}

export async function execSplitter (
  trainDataFile: string,
  splitDataDir: string,
  numOfWorkers: number,
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
  addListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  emit: ((event: 'completed') => boolean) & ((event: 'error', error: Error) => boolean)
  on: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  once: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  prependListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  prependOnceListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  removeListener: ((event: 'completed', listener: (fileName:string) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
}

export async function launchMasterNode (
  jobId: string,
  trainDataFile: string,
  outputDir: string,
  workerIpListFile: string,
  masterPort: number,
  masterIp: string,
  timeout: number,
  testData: string,
  trainBatchSize: number,
  device: string,
  n_epochs: number,
  datasetCache: string,
  num_workers: number,
  options: {
    logger?: Logger
    parallelGPTPath?: string
  }): Promise<IMasterNode> {
  const logger = options.logger != null ? options.logger : nullLogger
  const parallelGPTPath = options.parallelGPTPath != null ? options.parallelGPTPath : './'

  const logFile = path.join(parallelGPTPath, 'mn_log', `${jobId}.log`)
  await makeDir(path.dirname(logFile))

  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile)
  }
  if(fs.existsSync(datasetCache)) {
    fs.unlinkSync(datasetCache)
  }

  const emitter = new EventEmitter2()

  // launch MN.py
  const args = [
    'MN.py',
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
    '--num_workers', num_workers.toString(),
  ]

  logger.info(`Execute python3. command: python3 ${args.join(' ')}`)

  const child = spawn('python3', args,
    {
      cwd: parallelGPTPath,
      stdio: 'inherit'
    })

  let completed = false
  child.on('error', (err) => {
    emitter.emit('error', err)
  })

  child.on('exit', (code) => {
    if (!completed) {
      emitter.emit('error', new Error(`JobId:${jobId}, MN.py unexpectedly exited with code ${code}`))
    }
  })

  while (true) {
    if (fs.existsSync(logFile)) {
      break
    }
  }

  const tail = new Tail(logFile)

  tail.on('line', (line: string) => {
    logger.info(`JobId:${jobId}, MN.py is running :${line}`)

    try {
      const json = JSON.parse(line)

      if (json.status === 'COMPLETED' && !completed) {
        logger.info(`JobId:${jobId}, MN.py has completed`)

        completed = true
        emitter.emitAsync('completed', json.fileName)

        tail.unwatch()
      }
    } catch (e) { }
  })

  tail.watch()

  return emitter as IMasterNode
}
