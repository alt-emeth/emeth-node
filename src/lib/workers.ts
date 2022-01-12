import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { Knex } from 'knex'

import { COOPERATIVE } from './consistants'
import { Emeth } from '../types/contracts'
import { Worker } from '../types/tables'
import { BigNumber, Wallet } from 'ethers'
import path from 'path'
import delay from 'delay'
import os from 'os'
import { Logger } from 'log4js'
import { sign } from './crypto'
import { IAuth } from '../types/api'

export async function killWorkers (workers: Worker[], wallet:Wallet): Promise<void> {
  for (const worker of workers) {
    const timestamp = new Date().getTime()
    const sig = await sign(['uint256'], [timestamp], wallet)
  
    await axios.post(`${worker.url}/api/v1/kill`, {
      auth: {
        sig,
        timestamp
      } as IAuth
    })
  }
}

export function collectCandidateWorkerInfo (
  workers: Worker[], 
  requiredPowerCapacity:number): {
  candidateWorkers: Worker[]
  candidateWorkerPowerCapacity: number} {

  const cloned: Worker[] = JSON.parse(JSON.stringify(workers))
  cloned.sort((a, b) => {
    return b.power_capacity - a.power_capacity
  })

  const candidateWorkers: Worker[] = []

  let candidateWorkerPowerCapacity = 0

  for (const worker of cloned) {
    candidateWorkerPowerCapacity += worker.power_capacity
    candidateWorkers.push(worker)

    if (candidateWorkerPowerCapacity >= requiredPowerCapacity) {
      break
    }
  }

  return { candidateWorkerPowerCapacity, candidateWorkers }
}

export async function uploadFileToWorker (filename: string, worker: Worker, jobId: string, wallet:Wallet): Promise<void> {
  const timestamp = new Date().getTime()
  const sig = await sign(['uint256'], [timestamp], wallet)

  const file = fs.createReadStream(filename)

  const auth = {sig, timestamp}
  const data = {
    jobId,
    auth
  }
  const form = new FormData()
  form.append('data', JSON.stringify(data))
  form.append('file', file)

  await axios.post(`${worker.url}/api/v1/upload`, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  })
}

export async function processWorker(
  usedWorkers:Worker[], 
  splitDataDir:string, 
  testDataFile:string, 
  jobId:string, 
  masterPort:number,
  batchSize:number,
  n_epochs:number,
  timeLimit: number,
  workerIpListFile:string,
  wallet: Wallet
  ) {
  let index = 0
  for (const worker of usedWorkers) {
    // send data to worker
    index++

    const workerDataFile = path.join(splitDataDir, `train${index}.txt`)

    await uploadFileToWorker(workerDataFile, worker, jobId, wallet)
    await uploadFileToWorker(testDataFile, worker, jobId, wallet)

    const timestamp = new Date().getTime()
    const sig = await sign(['uint256'], [timestamp], wallet)

    // process worker
    const json = {
      train_data_file: `train${index}.txt`,
      test_data_file: 'valid.txt',
      master_port: masterPort,
      jobId,
      batchSize,
      n_epochs,
      num_workers: usedWorkers.length,
      rank: index,
      timeLimit,
      auth: {
        sig,
        timestamp
      } as IAuth
    }

    await axios.post(`${worker.url}/api/v1/process`, json)

  }

  fs.writeFileSync(workerIpListFile, usedWorkers.map(worker => new URL(worker.url).hostname).join(os.EOL))
}