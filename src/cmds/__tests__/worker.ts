import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import Express from 'express'
import fs, { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import request from 'supertest'

import worker from '../worker'

const axiosMock = new AxiosMockAdapter(axios)

let app: Express.Application

beforeAll(async () => {
  axiosMock.onPost('http://127.0.0.1:5000/api/v1/connect').reply(200, {
  })

  Express.application.listen = jest.fn().mockImplementation(function (this: Express.Application) {
    app = this

    return {}
  })

  const fakeParallelGPTPath = mkdtempSync(path.join(tmpdir(), 'emeth-node-test-'))

  fs.writeFileSync(path.join(fakeParallelGPTPath, 'WN.py'), `
import argparse
import time

parser = argparse.ArgumentParser()
parser.add_argument('--train_data_file')
parser.add_argument('--output_dir')
parser.add_argument('--rank')
parser.add_argument('--master_ip')
parser.add_argument('--master_port')
parser.add_argument('--log_file')
parser.add_argument('--timeout')
parser.add_argument('--test_data')
parser.add_argument('--train_batch_size')
parser.add_argument('--device')

args = parser.parse_args()

with open(args.log_file, mode='w') as f:
  time.sleep(5)
  f.write('{"status": "READY"}\\n')
  f.close()

time.sleep(5)
`)

  const args = {
    _: [],
    $0: 'worker',
    device: 'cpu',
    logger: console as any,
    masterIp: '127.0.0.1',
    parallelGPTPath: fakeParallelGPTPath,
    powerCapacity: 25000
  }
  //await worker.handler(args)
})

test('Worker has "None" status', async () => {
  await request(app).get('/api/v1/mode').expect(200, { result: 'None' })
})

test('Worker can be made to have "WaitData" status', async () => {
  await request(app).post('/api/v1/waitData')
  await request(app).get('/api/v1/mode').expect(200, { result: 'WaitData' })
})

test('Worker can spawn WN.py', async () => {
  await request(app).post('/api/v1/ready').type('json').send({
    train_data_file: 'train_data_file',
    test_data_file: 'test_data_file',
    output_dir: 'output_dir',
    master_port: 5000,
    jobId: 'jobId'
  })

  await request(app).get('/api/v1/mode').expect(200, { result: 'Ready' })

  for (let i = 0; i < 10; i++) {
    if ((await request(app).get('/api/v1/mode')).body.result === 'Idle') {
      break
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  for (let i = 0; i < 10; i++) {
    if ((await request(app).get('/api/v1/mode')).body.result === 'None') {
      break
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  await new Promise(resolve => setTimeout(resolve, 3000))
}, 30000)
