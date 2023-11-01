import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import * as fs from 'fs';
import * as path from 'path';

import { EmethModule } from './emeth';

import { ProcessorService } from './processor.service';
import { WorkerCommand } from './worker.command';

const JSON_CONFIG_FILENAME = 'emeth-node.json';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [
        () => {
          return JSON.parse(
            fs.readFileSync(
              process.env['EMETH_NODE_CONFIG'] ||
                path.join(__dirname, 'config', JSON_CONFIG_FILENAME),
              'utf-8',
            ),
          );
        },
      ],
    }),
    EmethModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        return {
          cacheServerUrl: config.get('cacheServerUrl'),
          emethCoreContractAddress: config.get('emethCoreContractAddress'),
          emethTokenContractAddress: config.get('emethTokenContractAddress'),
          endpoint: config.get('endpoint'),
          privateKey: config.get('privateKey'),
          storageApiUrl: config.get('storageApiUrl'),
        };
      },
    }),
  ],
  providers: [ProcessorService, WorkerCommand],
})
export class AppModule {}
