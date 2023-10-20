import * as byline from 'byline';
import decamelize from 'decamelize';
import Dockerode from 'dockerode';
import { Logger } from 'log4js';
import * as os from 'os';
import { Arguments } from 'yargs';

export interface ProcessorsMiddlewareArguments {
  processors: {
    run: (
      job: { id: string; param: string; programId: number },
      inputDirOrFile: string,
      outputDirOrFile: string,
      { enableGpu, logger }: { enableGpu: boolean; logger: Logger },
    ) => Promise<number>;
  };
}

export default function processors(args: Arguments & ProcessorsMiddlewareArguments): void {
  const docker = new Dockerode({
    version: 'v1.42',
  });

  args.processors = {
    async run(job, inputDir, outputDir, { enableGpu, logger }) {
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
        (await docker.listImages()).filter((imageInfo) => {
          return imageInfo.RepoTags?.includes(imageName);
        }).length > 0;

      if (!hasImage) {
        logger.info(`Pulling from ${imageName}...`);

        await new Promise<void>((resolve, reject) => {
          docker.pull(imageName, {}, (err, stream) => {
            if (err) {
              reject(err);
            } else {
              docker.modem.followProgress(stream, (err) => {
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
        logger.info(data.toString('utf-8'));
      });

      const stderrStream = byline.createStream().on('data', (data) => {
        logger.error(data.toString('utf-8'));
      });

      const createOptions: Dockerode.ContainerCreateOptions = {
        Tty: false,
        HostConfig: {
          Binds: [`${inputDir}:/input:rw`, `${outputDir}:/output:rw`],
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

        createOptions['User'] = `${userInfo.uid}:${userInfo.gid}`;
      }

      const [result, container] = await docker.run(
        imageName,
        [...params, job.id, '/input', '/output'],
        [stdoutStream, stderrStream],
        createOptions,
      );

      await container.remove();

      return result.StatusCode;
    },
  };
}
