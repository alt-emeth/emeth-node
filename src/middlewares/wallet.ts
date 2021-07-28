import { ethers } from 'ethers'
import { Arguments } from 'yargs'

export interface WalletMiddlewareArguments {
  wallet: ethers.Wallet
}

export default function wallet (args: Arguments): void {
  const ethersProvider = ethers.providers.getDefaultProvider(args.endpoint as string)

  args.wallet = new ethers.Wallet(args.privateKey as string, ethersProvider)
}
