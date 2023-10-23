import { ConfigurableModuleBuilder } from '@nestjs/common';
import { EmethModuleOptions } from './emeth.interfaces';

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
  new ConfigurableModuleBuilder<EmethModuleOptions>({
    moduleName: 'Emeth',
  }).build();
