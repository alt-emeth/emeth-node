import * as byline from 'byline';
import Dockerode from 'dockerode';
import { Logger } from 'log4js';
import { Arguments } from 'yargs';

export interface ProcessorsMiddlewareArguments {
  processors: {
    run: (
      job: { id: string; programId: number },
      inputDir: string,
      outputDir: string,
      { logger }: { logger: Logger },
    ) => Promise<number>;
  };
}

export default function processors(args: Arguments & ProcessorsMiddlewareArguments): void {
  const docker = new Dockerode({
    version: 'v1.42',
  });

  args.processors = {
    async run(job, inputDir, outputDir, { logger }) {
      const imageName = `emeth-module-${job.programId.toString().padStart(4, '0')}:latest`;

      const image = docker.getImage(imageName);
      if (!image) {
        logger.info(`Pulling from ${imageName}...`);

        await docker.pull(imageName);
      }

      const stdoutStream = byline.createStream().on('data', (data) => {
        logger.info(data.toString('utf-8'));
      });

      const stderrStream = byline.createStream().on('data', (data) => {
        logger.error(data.toString('utf-8'));
      });

      const [result, container] = await docker.run(
        imageName,
        [job.id, '/input', '/output'],
        [stdoutStream, stderrStream],
        {
          Tty: false,
          HostConfig: {
            Binds: [`${inputDir}:/input:rw`, `${outputDir}:/output:rw`],
          },
        },
      );

      await container.remove();

      return result.StatusCode;
    },
  };
}
