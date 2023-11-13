import { Injectable, Logger } from '@nestjs/common';
import * as byline from 'byline';
import * as decamelize from 'decamelize';
import * as Dockerode from 'dockerode';
import * as os from 'os';

@Injectable({})
export class ProcessorService {
  private readonly logger = new Logger(ProcessorService.name);

  private readonly docker = new Dockerode({
    version: 'v1.42',
  });

  async runProcessor(
    job: { id: string; param: string; programId: number },
    inputDirOrFile: string,
    outputDirOrFile: string,
    { enableGpu }: { enableGpu: boolean },
  ) {
    const params: string[] = [];

    if (job.param) {
      const json = JSON.parse(job.param);

      Object.keys(json).forEach((key: string) => {
        params.push('--' + decamelize(key).replace('_', '-'));
        params.push(json[key]);
      });
    }

    const imageName = `ghcr.io/alt-emeth/emeth-module-${job.programId
      .toString()
      .padStart(4, '0')}:latest`;

    const hasImage =
      (await this.docker.listImages()).filter((imageInfo) => {
        return imageInfo.RepoTags?.includes(imageName);
      }).length > 0;

    if (!hasImage) {
      this.logger.log(`Pulling from ${imageName}...`);

      await new Promise<void>((resolve, reject) => {
        this.docker.pull(imageName, {}, (err, stream) => {
          if (err) {
            reject(err);
          } else {
            this.docker.modem.followProgress(stream, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          }
        });
      });
    }

    const stdoutStream = byline.createStream().on('data', (data) => {
      this.logger.log(data.toString('utf-8'));
    });

    const stderrStream = byline.createStream().on('data', (data) => {
      this.logger.error(data.toString('utf-8'));
    });

    const createOptions: Dockerode.ContainerCreateOptions = {
      Tty: false,
      HostConfig: {
        Binds: [`${inputDirOrFile}:/input:rw`, `${outputDirOrFile}:/output:rw`],
        DeviceRequests: enableGpu
          ? [
              {
                Driver: 'nvidia',
                Count: -1,
                Capabilities: [['gpu']],
              },
            ]
          : undefined,
      },
    };

    if (process.platform == 'linux') {
      const userInfo = os.userInfo();

      createOptions['Env'] = ['HOME=/tmp'];
      createOptions['User'] = `${userInfo.uid}:${userInfo.gid}`;
    }

    const [result, container] = await this.docker.run(
      imageName,
      [...params, job.id, '/input', '/output'],
      [stdoutStream, stderrStream],
      createOptions,
    );

    await container.remove();

    return result.StatusCode;
  }
}
