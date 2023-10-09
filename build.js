const esbuild = require('esbuild');

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
  entryPoints: ['dist/main.js'],
  external: [
    '@nestjs/microservices',
    '@nestjs/platform-express',
    '@nestjs/websockets/socket-module',
    'class-transformer',
    'class-validator',
    'cpu-features',
  ],
  keepNames: true,
  minify: true,
  outfile: 'dist/bundle.js',
  platform: 'node',
  plugins: [ignoreNodePlugin],
});
