import { Inject, Injectable } from '@nestjs/common';
import { MODULE_OPTIONS_TOKEN } from './emeth.definition';
import { EmethModuleOptions } from './emeth.interfaces';
import { ethers } from 'ethers';

@Injectable()
export class EmethWalletService {
  private wallet: ethers.Wallet;

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private options: EmethModuleOptions,
  ) {
    const ethersProvider = ethers.providers.getDefaultProvider(
      options.endpoint,
    );

    this.wallet = new ethers.Wallet(options.privateKey, ethersProvider);
  }

  getWallet() {
    return this.wallet;
  }
}
