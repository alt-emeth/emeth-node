import axios from 'axios'
import FormData from 'form-data'
import fs from 'fs'
import { Knex } from 'knex'

import { MODE } from './consistants'
import { Emeth } from '../types/contracts'
import { Worker } from '../types/tables'
import { BigNumber } from 'ethers'

const computeRequiredPowerCapacity = (jobAssign: ReturnType<Emeth['jobAssigns']> extends Promise<infer T> ? T : never): number => {
  return jobAssign.gas.mul(BigNumber.from(1000000)).div(jobAssign.timeLimit).toNumber();
}

export async function killWorkers (workers: Worker[]): Promise<void> {
  for (const worker of workers) {
    await axios.post(`http://${worker.ipAddress}:3000/api/v1/kill`)
  }
}
export async function findAvailableWorkers (knex: Knex): Promise<Worker[]> {
  const availables: Worker[] = []

  const workers: Worker[] = await knex('workers')
  for (const worker of workers) {
    try {
      const status = await (await axios.get(`http://${worker.ipAddress}:3000/api/v1/mode`, { timeout: 1000 * 30 })).data

      if (status.result === MODE.None) {
        availables.push(worker)
      }
    } catch (e) {
      console.log(e)

      await knex('workers').delete().where({ ipAddress: worker.ipAddress })
    }
  }
  return availables
}

export function collectCandidateWorkerInfo (workers: Worker[], jobAssign: ReturnType<Emeth['jobAssigns']> extends Promise<infer T> ? T : never): {
  requiredPowerCapacity: number
  havingPowerCapacity: number
  candidateWorkers: Worker[]
  candidateWorkerPowerCapacity: number} {
  const requiredPowerCapacity = computeRequiredPowerCapacity(jobAssign)
  const havingPowerCapacity = workers.reduce((accumulator, worker) => accumulator + worker.powerCapacity, 0)

  const cloned: Worker[] = JSON.parse(JSON.stringify(workers))
  cloned.sort((a, b) => {
    return a.powerCapacity - b.powerCapacity
  })

  const candidateWorkers: Worker[] = []

  let candidateWorkerPowerCapacity = 0
  for (const worker of cloned) {
    candidateWorkerPowerCapacity += worker.powerCapacity
    candidateWorkers.push(worker)

    if (candidateWorkerPowerCapacity >= requiredPowerCapacity) {
      break
    }
  }

  return { requiredPowerCapacity, havingPowerCapacity, candidateWorkerPowerCapacity, candidateWorkers }
}

export async function uploadFileToWorker (filename: string, worker: Worker, jobId: string): Promise<void> {
  const file = fs.createReadStream(filename)

  const form = new FormData()
  form.append('jobId', jobId)
  form.append('file', file)

  await axios.post(`http://${worker.ipAddress}:3000/api/v1/upload`, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  })
}
