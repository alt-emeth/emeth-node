import fs from 'fs'
import BigNumber from 'bignumber.js'
import { Knex } from 'knex'
import path from 'path'
import { CommandModule } from 'yargs'

import contracts, { ContractsMiddlewareArguments } from '../middlewares/contracts'
import database, { DatabaseMiddlewareArguments } from '../middlewares/database'
import wallet, { WalletMiddlewareArguments } from '../middlewares/wallet'
import { exit } from 'process'
import interval from 'interval-promise'

let db: Knex

const withdraw: CommandModule<{} & DatabaseMiddlewareArguments & ContractsMiddlewareArguments & WalletMiddlewareArguments, {} & DatabaseMiddlewareArguments & ContractsMiddlewareArguments & WalletMiddlewareArguments> = {
  command: 'withdraw',
  describe: 'withdraw EMT token',
  builder: (yargs) => {
    return yargs
      .config('config', configPath => JSON.parse(fs.readFileSync(configPath, 'utf-8')))
      .default('config', path.resolve(__dirname, '..', 'config', 'master.json'))
      .default('dbpath', path.join(__dirname, '..', '..', 'emeth-node.sqlite3'))
      .string(['emethContractAddress', 'tokenContractAddress', 'privateKey'])
      .middleware([database, wallet, contracts])
      .middleware((args) => {
        db = args.db
      })
  },
  handler: async (args) => {
    const lastNodeSlotIndex = await args.db('lastNodeSlotIndex').first()
    let slotIndex = (lastNodeSlotIndex?.slotIndex)? lastNodeSlotIndex.slotIndex : 0
    const { emeth } = args.contracts
    const wallet = args.wallet
    const currentSlot = await emeth.currentSlot()
    console.log("Current slot number:" + currentSlot.toString())
    console.log("Start slot index:" + slotIndex)

    while(true) {
      try {
        const slot = await emeth.nodeSlots(wallet.address, slotIndex)
        console.log("Slot number:" + slot.toString())
        if (slot.toString() === currentSlot.toString()) {
          console.log(`Since it is current slot, it will be skipped`)
          break
        }
        const nodeGas = new BigNumber((await emeth.slotBalances(slot, wallet.address)).toString())
        const slotReward = await emeth.slots(slot)
        const totalGas = new BigNumber(slotReward[0].toString())
        const totalReward = new BigNumber(slotReward[1].toString())
        const reward = totalReward.times(nodeGas).div(totalGas).div('1000000000000000000')
        if(nodeGas.gt(0)) {
          const slotInfo = {
            slot: slot.toString(), 
            nodeGas: nodeGas.toFixed(), 
            totalReward: totalReward.toFixed(), 
            totalGas: totalGas.toFixed(), 
            reward: reward.toFixed()
          }
          console.log(`Withdraw reward from the slot ${JSON.stringify(slotInfo)}`)
          const tx = await emeth.withdrawSlotReward(slotInfo.slot);
          console.log(`Withdrew ${slotInfo.reward} EMT from slot ${slotInfo.slot}`)
        }
        slotIndex++
      } catch (e) {
        console.log(e.message)
        console.log(`Could not withdraw from slot ${slotIndex}. End the scan.`)
        break;
      }
    }
    console.log("End slot index:" + slotIndex)​
    if(lastNodeSlotIndex?.id) {
      lastNodeSlotIndex.slotIndex = slotIndex
      await args.db('lastNodeSlotIndex').update(lastNodeSlotIndex)
    } else {
      await args.db('lastNodeSlotIndex').insert({slotIndex})
    }
    exit();
  }
}

export = withdraw
