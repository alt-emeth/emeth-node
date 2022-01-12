import { getLogger, Logger } from 'log4js'
import { Arguments } from 'yargs'
import log4js from 'log4js'

log4js.configure({
  appenders: {
    out: { type: 'stdout', layout: {
      type: 'pattern',
      pattern: '%d{[yyyy-MM-dd hh:mm:ss]} [%p] %c %f{2} %l %m'
    }}
  },
  categories: { default: { appenders: ['out'], level: 'info', enableCallStack:true } }
})

export interface LoggerMiddlewareArguments {
  logger: Logger
}

export default function logger (args: Arguments): void {
  const logger = getLogger(args._.toString())
  logger.level = 'debug'

  args.logger = logger
}
