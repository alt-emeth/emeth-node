import fs from 'fs';
import path from 'path';
import { Arguments } from 'yargs';

export interface ProcessorsMiddlewareArguments {
  processors: Map<number, string>;
}

export default function processors(
  args: Arguments & {
    includeProcessor?: number[];
    excludeProcessor?: number[];
  },
): void {
  const processors = new Map<number, string>();

  for (const dirent of fs.readdirSync(args.emethModulesDir as string, {
    withFileTypes: true,
  })) {
    if (dirent.isFile()) {
      const parsedPath = path.parse(dirent.name);

      if (parsedPath.ext == '.js' && parsedPath.name.match(/^[0-9]+$/)) {
        const programId = Number(parsedPath.name);

        if (args.includeProcessor) {
          if (!args.includeProcessor.includes(programId)) {
            continue;
          }
        } else if (args.excludeProcessor) {
          if (args.excludeProcessor.includes(programId)) {
            continue;
          }
        }

        processors.set(programId, dirent.name);
      }
    }
  }

  if (processors.size == 0) {
    throw 'No processors.';
  }

  ((args as unknown) as ProcessorsMiddlewareArguments).processors = processors;
}
