import { Inject, Injectable } from '@nestjs/common';
import { MODULE_OPTIONS_TOKEN } from './emeth.definition';
import { EmethModuleOptions } from './emeth.interfaces';

@Injectable()
export class EmethCacheService {
  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private options: EmethModuleOptions,
  ) {}

  async getRequestedJobs() {
    const cacheServerUrl = new URL(this.options.cacheServerUrl);
    cacheServerUrl.searchParams.append('status', '1');

    return (await fetch(cacheServerUrl)).json();
  }

  async getJob(jobId: string) {
    const cacheServerUrl = new URL(this.options.cacheServerUrl);
    cacheServerUrl.searchParams.append('id', jobId);

    return (await fetch(cacheServerUrl)).json();
  }
}
