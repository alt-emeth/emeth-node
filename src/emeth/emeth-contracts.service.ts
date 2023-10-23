import { Inject, Injectable } from '@nestjs/common';
import { ethers } from 'ethers';

import { MODULE_OPTIONS_TOKEN } from './emeth.definition';
import { EmethModuleOptions } from './emeth.interfaces';
import { EmethWalletService } from './emeth-wallet.service';

import { EmethCore, EmethToken } from '../types/contracts';

@Injectable()
export class EmethContractsService {
  private readonly emethCoreContractAddress: string;
  private readonly emethCoreContract: EmethCore;

  private readonly emethTokenContractAddress: string;
  private readonly emethTokenContract: EmethToken;

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private options: EmethModuleOptions,
    @Inject(EmethWalletService) private walletService: EmethWalletService,
  ) {
    ({
      emethCoreContractAddress: this.emethCoreContractAddress,
      emethTokenContractAddress: this.emethTokenContractAddress,
    } = options);

    const abis = {
      emethCore: require('../contracts/emeth-core.json'),
      emethToken: require('../contracts/emeth-token.json'),
    };

    const wallet = this.walletService.getWallet();

    this.emethCoreContract = new ethers.Contract(
      this.emethCoreContractAddress,
      abis.emethCore,
      wallet,
    ) as unknown as EmethCore;

    this.emethTokenContract = new ethers.Contract(
      this.emethTokenContractAddress,
      abis.emethToken,
      wallet,
    ) as unknown as EmethToken;
  }

  getEmethCoreContractAddress() {
    return this.emethCoreContractAddress;
  }

  getEmethCoreContract() {
    return this.emethCoreContract;
  }

  getEmethTokenContractAddress() {
    return this.emethTokenContractAddress;
  }

  getEmethTokenContract() {
    return this.emethTokenContract;
  }
}
