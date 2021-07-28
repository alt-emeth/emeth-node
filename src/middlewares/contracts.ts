import { ethers } from 'ethers'
import { Arguments } from 'yargs'

import { Emeth, EmethToken } from '../types/contracts'

export interface ContractsMiddlewareArguments {
  contracts: {
    emeth: Emeth
    emethToken: EmethToken
  }
}

export default function contracts (args: Arguments): void {
  const abis = {
    emeth: require('../contracts/emeth.json'),
    emethToken: require('../contracts/emeth-token.json')
  }

  args.contracts = {
    emeth: new ethers.Contract(args.emethContractAddress as string, abis.emeth, args.wallet as ethers.Wallet),
    emethToken: new ethers.Contract(args.tokenContractAddress as string, abis.emethToken, args.wallet as ethers.Wallet)
  }
}
