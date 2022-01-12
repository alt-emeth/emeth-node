import { Logger } from "@ethersproject/logger"
import { Wallet } from "@ethersproject/wallet"
import axios from "axios"
import { logger } from "ethers"
import interval from "interval-promise"
import { Arguments } from "yargs"
import { sign } from "../../lib/crypto"
import { WalletMiddlewareArguments } from "../wallet"
import { WorkerProcesser } from "./processer"

const connect = async(
  logger:Logger, 
  powerCapacity:number, 
  wallet:Wallet,
  my_url:string, 
  boot_node_url:string):Promise<{url:string, address:string}> => {

  const signedtime = new Date().getTime()
  const sig = await sign(['uint256'], [signedtime], wallet)
  const address = wallet.address

  const res = (await axios.post(`${boot_node_url}/api/v1/connect`, {
    powerCapacity,
    address,
    signedtime,
    sig,
    url: my_url
  })).data

  logger.info(`Connected masetr node. (url:${res.url}, address:${res.address})`)

  return {url:res.url, address: res.address}
}


export default async function workerConnector (args: Arguments): Promise<void> {
  const my_url = args.my_url as string
  const wallet = args.wallet as Wallet
  const boot_node_url = args.master_node_url as string
  const workerProcesser = args.workerProcesser as WorkerProcesser
  const powerCapacity = args.powerCapacity as number

  const {url, address} = await connect(logger, powerCapacity, wallet, my_url, boot_node_url)
  args.master_node_url = url
  args.masterAddress = address

  interval(async() => {
    if(!workerProcesser.isRunning()) {
      const connected = await axios.get(`${args.master_node_url}/api/v1/connected?url=${my_url}`)
      if(!connected.data.result) {
        const {url, address} = await connect(logger, powerCapacity, wallet, my_url, boot_node_url)
        args.master_node_url = url
        args.masterAddress = address
      }
    }
  }, 1000, {
    stopOnError:false
  })
}