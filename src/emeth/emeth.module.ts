import { Module } from '@nestjs/common';

import { ConfigurableModuleClass } from './emeth.definition';
import { EmethCacheService } from './emeth-cache.service';
import { EmethContractsService } from './emeth-contracts.service';
import { EmethWalletService } from './emeth-wallet.service';

@Module({
  providers: [EmethCacheService, EmethContractsService, EmethWalletService],
  exports: [EmethCacheService, EmethContractsService, EmethWalletService],
})
export class EmethModule extends ConfigurableModuleClass {}
