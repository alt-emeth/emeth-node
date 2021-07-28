import { getLogger, Logger } from 'log4js'
import { Arguments } from 'yargs'

export interface LoggerMiddlewareArguments {
  logger: Logger
}

export default function logger (args: Arguments): void {
  const logger = getLogger(args._.toString())
  logger.level = 'debug'

  args.logger = logger
}
