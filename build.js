const esbuild = require('esbuild');
const path = require('path');

let ignoreNodePlugin = {
  name: 'ignore-node',
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, (args) => {
      return { path: args.path, external: true };
    });
  },
};

esbuild.build({
  bundle: true,
  entryPoints: ['src/cli.ts'],
  external: ['cpu-features'],
  minify: true,
  outfile: 'dist/bundle.js',
  platform: 'node',
  plugins: [ignoreNodePlugin],
});
