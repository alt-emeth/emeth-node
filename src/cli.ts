// eslint-disable-next-line @typescript-eslint/no-var-requires
const yargs = require('yargs');

import worker from './cmds/worker';

yargs.help().command(worker).parse(process.argv.slice(2));
