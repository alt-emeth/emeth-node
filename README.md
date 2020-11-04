## Igniscan

Block Explorer UI for BURN Blockchain

## Install `igniscan`
### Install modules
```shell
$ yarn
```

### Building the source
```shell
$ yarn build
```

### Configure .env

| Parameter | Description |
| --------- | ---------------------------------------- |
| PORT | Port for serving Igniscan UI |
| BURN_API_URL | `burn` REST API URL. e.g. `http://localhost:8545/scan` |
| ETHERSCAN_URL | Checkpoint transaction link URL e.g. `https://etherscan.io/` |
| ADDRESS_PREFIX | Default to display address with '0x' prefix. |

## Customize appearance
Edit the following .pug files.
- views/common/navbar.pug
- views/common/fotter.pug
- views/pages/dashboard.pug

## Run `igniscan` process

```shell
yarn start
```
or use `pm2` process manager
```shell
pm2 start ./bin/www igniscan
```

