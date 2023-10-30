import { Module } from '@nestjs/common';

import { ConfigurableModuleClass } from './emeth.definition';
import { EmethCacheService } from './emeth-cache.service';
import { EmethContractsService } from './emeth-contracts.service';
import { EmethWalletService } from './emeth-wallet.service';
import { EmethStorageService } from './emeth-storage.service';

@Module({
  providers: [
    EmethCacheService,
    EmethContractsService,
    EmethStorageService,
    EmethWalletService,
  ],
  exports: [
    EmethCacheService,
    EmethContractsService,
    EmethStorageService,
    EmethWalletService,
  ],
})
export class EmethModule extends ConfigurableModuleClass {}
