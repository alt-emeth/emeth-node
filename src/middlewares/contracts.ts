import { Contract, Wallet } from 'ethers';
import { Arguments } from 'yargs';

import { EmethCore, EmethToken } from '../types/contracts';

export interface ContractsMiddlewareArguments {
  contracts: {
    emethCore: EmethCore;
    emethToken: EmethToken;
  };
}

export default function contracts(args: Arguments): void {
  const abis = {
    emethCore: require('../contracts/emeth-core.json'),
    emethToken: require('../contracts/emeth-token.json'),
  };

  args.contracts = {
    emethCore: new Contract(
      args.emethCoreContractAddress as string,
      abis.emethCore,
      args.wallet as Wallet,
    ),
    emethToken: new Contract(
      args.emethTokenContractAddress as string,
      abis.emethToken,
      args.wallet as Wallet,
    ),
  };
}
