import { Contract, Event, EventFilter } from 'ethers'
import { EventEmitter2 } from 'eventemitter2'
import fastqueue from 'fastq'

declare interface IContractEventWatcher {
  addListener: ((event: 'startBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'endBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'event', listener: (event: Event) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  emit: ((event: 'startBlock', blockNumber: number) => boolean) & ((event: 'endBlock', blockNumber: number) => boolean) & ((event: 'event', contractEvent: Event) => boolean) & ((event: 'error', error: Error) => boolean)
  on: ((event: 'startBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'endBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'event', listener: (event: Event) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  once: ((event: 'startBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'endBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'event', listener: (event: Event) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  prependListener: ((event: 'startBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'endBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'event', listener: (event: Event) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  prependOnceListener: ((event: 'startBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'endBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'event', listener: (event: Event) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
  removeListener: ((event: 'startBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'endBlock', listener: (blockNumber: number) => void|Promise<void>) => this) & ((event: 'event', listener: (event: Event) => void|Promise<void>) => this) & ((event: 'error', listener: (error: Error) => void|Promise<void>) => this)
}

export default function watchContractEvent (contract: Contract, filter: EventFilter, fromBlock: number): IContractEventWatcher {
  const emitter = new EventEmitter2()

  process.nextTick(() => {
    const queue = fastqueue((blockNumber: number, cb) => {
      (async () => {
        await emitter.emitAsync('startBlock', blockNumber)

        const events = await contract.queryFilter(filter, blockNumber, blockNumber)

        for (const event of events) {
          await emitter.emitAsync('event', event)
        }

        await emitter.emitAsync('endBlock', blockNumber)
      })().then(() => cb(null)).catch((e) => {
        emitter.emit('error', e)
      })
    }, 1)

    contract.provider.getBlockNumber().then(async (blockNumber) => {
      const events = await contract.queryFilter(filter, fromBlock, blockNumber)

      for (let i = 0; i < events.length; i++) {
        const blockNumber = events[i].blockNumber
        if (i === 0 || blockNumber !== events[i - 1].blockNumber) {
          await emitter.emitAsync('startBlock', events[i].blockNumber)
        }

        await emitter.emitAsync('event', events[i])

        if (i === events.length - 1 || blockNumber !== events[i + 1].blockNumber) {
          await emitter.emitAsync('endBlock', events[i].blockNumber)
        }
      }

      contract.provider.on('block', (blockNumber: number) => {
        queue.push(blockNumber)
      })
    }).catch((e) => {
      emitter.emit('error', e)
    })
  })

  return emitter as IContractEventWatcher
}
