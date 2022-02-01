import { JobStatus, Worker } from '../types/tables'
import { ChildProcess } from 'child_process'
import { initWorkers } from '../lib/workers'
import { Arguments } from 'yargs'
import { Wallet } from '@ethersproject/wallet'

export interface ExitHandlerMiddlewareArguments {
  processHolder: ProcessHolder
}

export class ProcessHolder {
  private _processes:{[key:string]: {child:ChildProcess, usedWorkers:Worker[], masterport:number}} = {}

  public get processes() {
    return this._processes
  }

  public register(jobId:string, child:ChildProcess, usedWorkers:Worker[] = [], masterport = 0) {
    this._processes[jobId] = {child, usedWorkers, masterport}
  }

  public unregister(jobId:string) {
    delete this._processes[jobId]
  }

  public deleteWorker(jobId:string, worker:Worker) {
    if(jobId in this._processes) {
      this._processes[jobId].usedWorkers = this._processes[jobId].usedWorkers.filter((item) => item.address != worker.address)
    }
  }

  public processingJobId(workerAddress:string) {
    let jobId:string|null = null

    for(const key of (Object.keys(this._processes))) {
      const worker = this._processes[key].usedWorkers.find(worker => worker.address === workerAddress)
      if(worker) {
        jobId = key
        break
      }
    }

    return jobId
  }

  public async cleanAllProcess(wallet:Wallet) {
    const jobIds = Object.keys(this._processes)
    for(const jobId of jobIds) {
      await this.cleanProcess(jobId, wallet)
    }
  }

  public async cleanProcess(jobId:string, wallet:Wallet) {
    try {
      this._processes[jobId].child.kill(9)

      if(this._processes[jobId].usedWorkers.length > 0) {
        await initWorkers(this._processes[jobId].usedWorkers, wallet)
      }
    } catch (e) {
      console.log(e)
    } finally {
      this.unregister(jobId)
    }
  }
}

export default function exitHandler (args: Arguments): void {
  const processHolder = new ProcessHolder()
  const wallet = args.wallet as Wallet
  args.processHolder = processHolder

  const eventTypes = ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM']

  eventTypes.forEach((type) => {
    process.on(type, (code:number|undefined) => {
      (args.processHolder as ProcessHolder).cleanAllProcess(wallet)
      process.exit(code)
    })
  })
}