import * as byline from 'byline';
import Dockerode from 'dockerode';
import { Logger } from 'log4js';
import * as os from 'os';
import { Arguments } from 'yargs';

export interface ProcessorsMiddlewareArguments {
  processors: {
    run: (
      job: { id: string; programId: number },
      inputDir: string,
      outputDir: string,
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
        [job.id, '/input', '/output'],
        [stdoutStream, stderrStream],
        createOptions,
      );

      await container.remove();

      return result.StatusCode;
    },
  };
}
