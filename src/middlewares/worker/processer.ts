import { ChildProcess, spawn } from "child_process"
import fs from 'fs'
import interval, { stop } from "interval-promise"
import { Logger } from "log4js"
import { exit } from "process"
import {Tail} from "tail"
import { Arguments } from "yargs"
import { MODE } from "../../lib/consistants"
import { ProcessHolder } from "../exit-handler"

export interface WorkerProcesserMiddlewareArguments {
  workerProcesser: WorkerProcesser
}

const extractMode = (line:string):string|null => {

  line = line.replace(/\r?\n/g, '')

  let json = null
  try {
    json = JSON.parse(line)
  } catch (e) {}

  if (json && json.status && json.status in MODE) {
    const status = json.status as keyof typeof MODE
    return MODE[status]
  }

  return null;
}

const MODE_TIME_LIMIT = {
  [MODE.WAIT_DATA] : 0,
  [MODE.IDLE] : 0,
  [MODE.LEARNING]: 0,
  [MODE.CHECKPOINT]: 0
}

export class WorkerProcesser {
  private _mode: string
  private _time:number
  private _jobId: string
  private _child:ChildProcess|null
  private _tail: Tail|null

  constructor() {
    this._mode = MODE.NONE
    this._time = 0
    this._jobId = ""
    this._child = null
    this._tail = null
  }

  public get mode() {
    return this._mode
  }

  public get jobId() {
    return this._jobId
  }

  public waitData(logger:Logger) {
    logger.info(`Change mode to: ${MODE.WAIT_DATA}`)
    this._mode = MODE.WAIT_DATA
    this._time = new Date().getTime()
  }

  public none(logger:Logger) {
    logger.info(`Change mode to: ${MODE.NONE}`)
    this._mode = MODE.NONE
  }

  public isTimeout():boolean {
    if(this._mode in MODE_TIME_LIMIT &&
      new Date().getTime() - this._time > MODE_TIME_LIMIT[this._mode]) {
      return true
    }
    return false
  }

  public isRunning():boolean {
    if(this._mode == MODE.NONE || 
      this._mode == MODE.COMPLETED || 
      this._mode == MODE.FAILED || 
      this._mode == MODE.SYSTEM_FAILED) {
      return false
    }
    if(this._jobId.length == 0) {
      return false
    }
    if(!this._child) {
      return false
    }
    if(!this._tail) {
      return false
    }

    return true
  }

  public process(
    jobId:string,
    parallelGPTPath: string,
    logger:Logger,
    processHolder:ProcessHolder,
    trainDataFile: string,
    outputDir: string,
    rank: number,
    master_node_url: string,
    masterPort: number,
    logFile : string,
    timeLimit: number,
    testDataFile: string,
    batchSize: number,
    device:string,
    n_epochs:number,
    datasetCache:string,
    num_workers: number,
    language:string
  ) {
    const masterIp = new URL(master_node_url).hostname

    const args = [
      'dist/WN.py',
      '--train_data_file', trainDataFile,
      '--output_dir', outputDir,
      '--rank', rank.toString(),
      '--master_ip', masterIp,
      '--master_port', masterPort.toString(),
      '--log_file', logFile,
      '--timeout', timeLimit.toString(),
      '--test_data', testDataFile,
      '--train_batch_size', batchSize.toString(),
      '--device', device,
      '--n_epochs', n_epochs.toString(),
      '--dataset_cache', datasetCache,
      '--num_workers', num_workers.toString(),
      '--language', language
    ]

    this._child = spawn('python3', args, {
      cwd: parallelGPTPath,
      stdio: 'inherit'
    })

    this._child.on('close', () => {
      logger.info('Process closed.')

      this.clean(processHolder)
    })

    this._jobId = jobId

    processHolder.register(this._jobId, this._child)

    logger.debug('jobId:' + jobId + ', Exec python process. command: python3 ' + args.join(' '))

    while(true) {
      if(fs.existsSync(logFile)) {
        break;
      }
    }

    this._tail = new Tail(logFile as string);

    logger.debug(`jobId:${this._jobId}, tail start :${logFile}`);

    this._tail.on('line', async(line) => {
      logger.debug(`jobId:${jobId}, WN.py is running :${line}`)

      const extracted = extractMode(line)

      if(extracted) {
        if(this._mode != extracted) {
          logger.info(`Change mode to: ${extracted}`)
          this._time = new Date().getTime()
        }
        if(this._mode == MODE.LEARNING) {
          this._time = new Date().getTime()
        }
        this._mode = extracted
      }
    })

    this._tail.on('error', logger.error)

    this._tail.watch()

    logger.info(`Change mode to: ${MODE.IDLE}`)
    this._mode = MODE.IDLE
    this._time = new Date().getTime()

    logger.info(`jobId:${jobId}, Monitoring WN.py state.`)

    interval(async(iteration, stop) => {
      if(!this.isRunning()) {
        stop()
      } else if(this._mode == MODE.SYSTEM_FAILED) {
        logger.info(`jobId:${this._jobId}, WN.py is a system failed, so terminate the process`)
        exit(1)
      }

      if(this.isTimeout()) {
        logger.info(`jobId:${jobId}, Timeout WN.py process. mode:${this._mode}`)

        logger.info(`Change mode to: ${MODE.NONE}`)

        this._mode = MODE.NONE

        this.clean(processHolder)
        stop()
      }
    }, 1000, {
      stopOnError: false
    }) as unknown as void
  }

  public clean(processHolder:ProcessHolder) {
    this._time = 0

    if(this._jobId.length > 0) {
      processHolder.unregister(this._jobId)
      this._jobId = ""
    }
    if(this._child) {
      this._child.kill(9)
      this._child = null
    }
    if(this._tail) {
      this._tail.unwatch()
      this._tail = null
    }
  }
}

export default function workerProcesser (args: Arguments): void {
  MODE_TIME_LIMIT[MODE.WAIT_DATA] = (args.timeout as any).wait_data
  MODE_TIME_LIMIT[MODE.IDLE] = (args.timeout as any).idle
  MODE_TIME_LIMIT[MODE.LEARNING] = (args.timeout as any).learning
  MODE_TIME_LIMIT[MODE.CHECKPOINT] = (args.timeout as any).checkpoint

  args.workerProcesser = new WorkerProcesser()
}