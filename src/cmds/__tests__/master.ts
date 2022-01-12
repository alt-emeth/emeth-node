import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import Express from 'express'
import fs from 'fs'
import knex, { Knex } from 'knex'
import path from 'path'
import os from 'os'
import { Readable } from 'stream'
import request from 'supertest'
import { Account } from 'web3-core/types'
import { Contract } from 'web3-eth-contract'

import master from '../master'
import contracts from '../../middlewares/contracts'
import wallet from '../../middlewares/wallet'
import * as migrations from '../../migrations/sqlite3'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const solc = require('solc')

const web3 = (global as any).web3

let emethAddress: string, emethTokenAddress: string
let emethContract: Contract, emethTokenContract: Contract

let accounts: string[], newAccount: Account

let app: Express.Application

let db: Knex

beforeAll(async () => {
  accounts = await web3.eth.getAccounts()
  newAccount = web3.eth.accounts.create()

  await web3.eth.sendTransaction({
    from: accounts[1],
    to: newAccount.address,
    value: '1000000000000000000'
  })

  const output = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: {
      'EmethToken.sol': {
        content: fs.readFileSync(path.join(__dirname, '/../../contracts/EmethToken.sol'), 'utf8')
      },
      'Emeth.sol': {
        content: fs.readFileSync(path.join(__dirname, '/../../contracts/Emeth.sol'), 'utf8')
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['*']
        }
      }
    }
  })))

  emethTokenContract = await new web3.eth.Contract(output.contracts['EmethToken.sol'].EmethToken.abi).deploy({
    data: '0x' + (output.contracts['EmethToken.sol'].EmethToken.evm.bytecode.object as string)
  }).send({
    from: accounts[0],
    gas: 6721975,
    gasPrice: '100000000000'
  })

  emethTokenAddress = emethTokenContract.options.address

  emethContract = await new web3.eth.Contract(output.contracts['Emeth.sol'].Emeth.abi).deploy({
    data: '0x' + (output.contracts['Emeth.sol'].Emeth.evm.bytecode.object as string),
    arguments: [emethTokenAddress, 0]
  }).send({
    from: accounts[0],
    gas: 6721975,
    gasPrice: '100000000000'
  })

  emethAddress = emethContract.options.address

  await emethTokenContract.methods.transfer(newAccount.address, '5000000000000000000000').send({
    from: accounts[0],
    gas: 6721975,
    gasPrice: '100000000000'
  })

  Express.application.listen = jest.fn().mockImplementation(function (this: Express.Application) {
    app = this

    return {}
  })

  const fakeParallelGPTPath = fs.mkdtempSync(path.join(os.tmpdir(), 'emeth-node-test-'))

  fs.writeFileSync(path.join(fakeParallelGPTPath, 'splitter.py'), '')

  fs.writeFileSync(path.join(fakeParallelGPTPath, 'MN.py'), `
import argparse
import time

parser = argparse.ArgumentParser()
parser.add_argument('--train_data_file')
parser.add_argument('--output_dir')
parser.add_argument('--worker_ip_list')
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
  f.write('{"status": "COMPLETED"}\\n')
  f.close()

with open(args.output_dir + "/model.pt", mode='w') as f:
  f.write('data')
  f.close()

with open(args.output_dir + "/model_training_args.bin", mode='w') as f:
  f.write('data')
  f.close()
  
time.sleep(5)
`)

  db = knex({
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    pool: {
      min: 1,
      max: 1
    },
    migrations: {
      migrationSource: migrations
    },
    useNullAsDefault: true
  })

  await db.migrate.latest()

  await db('workers').insert({
    url: 'http://127.0.0.1:3000',
    power_capacity: 25000
  })

  const attachArgs = {
    _: [],
    $0: 'attach',
    emethContractAddress: emethAddress,
    tokenContractAddress: emethTokenAddress,
    endpoint: (global as any).ganacheUrl,
    privateKey: newAccount.privateKey,
    db: db
  } as any

  await wallet(attachArgs)
  await contracts(attachArgs)

  const args = {
    _: [],
    $0: 'master',
    emethContractAddress: emethAddress,
    tokenContractAddress: emethTokenAddress,
    endpoint: (global as any).ganacheUrl,
    privateKey: newAccount.privateKey,
    db: db,
    logger: console,
    parallelGPTPath: fakeParallelGPTPath,
    batchSize: 4,
    device: 'cpu',
    myIp: '127.0.0.1',
    n_epochs: 6
  } as any

  await wallet(args)
  await contracts(args)
  await master.handler(args)
})

afterAll(async () => {
  await db.destroy()
})

const axiosMock = new AxiosMockAdapter(axios)

afterEach(() => {
  axiosMock.reset()
})

test('Master can accept connection from workers', async () => {
  await request(app)
    .post('/api/v1/connect')
    .type('json')
    .send({
      ipAddress: '127.0.0.2',
      port: '3000',
      batchSize: 5,
      powerCapacity: 25000
    })
    .expect(200, { result: 'OK' })
})

test('Master can handle assign event', async () => {
  await emethContract.methods.request(Buffer.from('00000000000000000000000000abcdef', 'hex'), 1, 'dataset', 'param', 100, 1, 36000000).send({
    from: accounts[0],
    gas: 6721975,
    gasPrice: '100000000000'
  })

  await emethContract.methods.assign(Buffer.from('00000000000000000000000000abcdef', 'hex'), newAccount.address, 100, 36000000).send({
    from: accounts[0],
    gas: 6721975,
    gasPrice: '100000000000'
  })

  axiosMock.onGet('http://127.0.0.1:3000/api/v1/mode').replyOnce(200, { result: 'None' })
  axiosMock.onPost('http://127.0.0.1:3000/api/v1/waitData').reply(200, { result: 'WaitData' })
  axiosMock.onPost('http://127.0.0.1:3000/api/v1/upload').reply(200, '')
  axiosMock.onPost('http://127.0.0.1:3000/api/v1/ready').reply(200, { result: 'Ready' })
  axiosMock.onGet('http://127.0.0.1:3000/api/v1/mode').replyOnce(200, { result: 'Idle' })

  axiosMock.onPost('http://127.0.0.1:3000/api/v1/node/signed-get-url').reply(200, {
    url: 'http://127.0.0.1:3000/get-s3'
  })
  axiosMock.onGet('http://127.0.0.1:3000/get-s3').reply(200, Readable.from('data'))

  axiosMock.onPost('http://127.0.0.1:3000/api/v1/node/signed-put-url').reply(200, {
    url: 'http://127.0.0.1:3000/put-s3',
    fileName: 'fileName'
  })
  axiosMock.onPut('http://127.0.0.1:3000/put-s3').reply(200)

  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}, 30000)
