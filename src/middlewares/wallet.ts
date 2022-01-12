import { ethers } from 'ethers'
import { Arguments } from 'yargs'
import fs from 'fs'
import makeDir from 'make-dir'
import path from 'path'

export interface WalletMiddlewareArguments {
  wallet: ethers.Wallet
}

export default async function wallet (args: Arguments): Promise<void> {
  const ethersProvider = ethers.providers.getDefaultProvider(args.endpoint as string)
  const generatedUIDPath = args.generatedUIDPath as string

  if(args.privateKey && (args.privateKey as string).length > 0) {
    args.wallet = new ethers.Wallet(args.privateKey as string, ethersProvider)
  } else {
    if(fs.existsSync(generatedUIDPath)) {
      args.wallet = new ethers.Wallet(require(generatedUIDPath).privateKey as string, ethersProvider)
    } else {
      const wallet = ethers.Wallet.createRandom()

      await makeDir(path.dirname(generatedUIDPath))

      fs.writeFileSync(generatedUIDPath, JSON.stringify({
        address: wallet.address,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey
      }))

      args.wallet = new ethers.Wallet(wallet.privateKey, ethersProvider)
    }
    
  }
}
