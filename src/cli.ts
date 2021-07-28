import yargs from 'yargs'

yargs
  .help()
  .commandDir('cmds', { extensions: ['js', 'ts'] })
  .parse(process.argv.slice(2))
