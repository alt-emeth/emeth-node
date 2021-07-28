import axios from 'axios'
import AxiosMockAdapter from 'axios-mock-adapter'
import * as fs from 'fs'
import knex, { Knex } from 'knex'
import * as path from 'path'
import Web3 from 'web3'
import { Account } from 'web3-core/types'
import { Contract } from 'web3-eth-contract'

import attach from '../attach'
import detach from '../detach'
import contracts from '../../middlewares/contracts'
import wallet from '../../middlewares/wallet'
import * as migrations from '../../migrations'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const solc = require('solc')

declare global {
  const ganacheUrl: string
  const web3: Web3
}

let emethAddress: string, emethTokenAddress: string
let emethContract: Contract, emethTokenContract: Contract

let accounts: string[], newAccount: Account

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
    ipAddress: '127.0.0.1',
    port: 3000,
    powerCapacity: 25000,
    batchSize: 4
  })
})

afterAll(async () => {
  await db.destroy()
})

const axiosMock = new AxiosMockAdapter(axios)

afterEach(() => {
  axiosMock.reset()
})

describe('Attach and detach from/to Emeth smart contract', (): void => {
  test('Attach to Emeth', async () => {
    axiosMock.onGet('http://127.0.0.1:3000/api/v1/profile').reply(200, {
      powerCapacity: 25000
    })

    const args = {
      _: [],
      $0: 'attach',
      emethContractAddress: emethAddress,
      tokenContractAddress: emethTokenAddress,
      endpoint: ganacheUrl,
      privateKey: newAccount.privateKey,
      db: db
    } as any

    await wallet(args)
    await contracts(args)

    await attach.handler(args)

    const allowance = await emethTokenContract.methods.allowance(newAccount.address, emethAddress).call()
    expect(allowance).toBe('0')

    const tokenBalance = await emethTokenContract.methods.balanceOf(newAccount.address).call()
    expect(tokenBalance).toBe('2500000000000000000000')

    const node = await emethContract.methods.nodes(newAccount.address).call()

    expect(node).toMatchObject({
      active: true,
      totalCapacity: '25000',
      lockedCapacity: '0',
      workers: '1',
      deposit: '2500000000000000000000'
    })
  }, 300000)

  test('Detach from Emeth', async () => {
    const args = {
      _: [],
      $0: 'detach',
      emethContractAddress: emethAddress,
      tokenContractAddress: emethTokenAddress,
      endpoint: ganacheUrl,
      privateKey: newAccount.privateKey
    } as any

    await wallet(args)
    await contracts(args)
    await detach.handler(args)

    const node = await emethContract.methods.nodes(newAccount.address).call()

    expect(node).toMatchObject({
      active: false,
      deposit: '0'
    })
  }, 300000)
})
