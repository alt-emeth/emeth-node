# emeth-node

## Prerequisite
### OS configuration
A swap size is recommended to be set to at least the same size of RAM.

### node & npm version
```
$ node -v
v12.18.3

$ npm -v
6.14.6
```

### python setup
Install python and pip

Example (Ubuntu):
```
$ sudo add-apt-repository ppa:deadsnakes/ppa
$ sudo apt update
$ sudo apt install python3.6 python3-pip
```

Install related packages
```
$ cd parallelGPT
$ pip3 install -r requirementgpu.txt
```

### GPU seetup
Check CUDA
```
$ nvidia-smi
```

Install CUDA
```
$ wget http://developer.download.nvidia.com/compute/cuda/11.0.2/local_installers/cuda_11.0.2_450.51.05_linux.run
$ sudo sh cuda_11.0.2_450.51.05_linux.run
$ export PATH=/usr/local/cuda-11.0/bin:$PATH
$ export LD_LIBRARY_PATH=/usr/local/cuda-11.0/lib64:$LD_LIBRARY_PATH
```

### Install cudann

Example:
```
// It varies depending on the CUDA version
// In this example, we install cudann 8.0.2 for cuda 11.0
Download from https://developer.nvidia.com/cudnn
$ tar -xzvf cudnn-11.0-linux-x64-v8.0.2.39.tgz
$ sudo cp cuda/include/cudnn*.h /usr/local/cuda/include
$ sudo cp cuda/lib64/libcudnn* /usr/local/cuda/lib64
$ sudo chmod a+r /usr/local/cuda/include/cudnn*.h /usr/local/cuda/lib64/libcudnn*
```

### Install NCCL
```
$ sudo dpkg -i nvidia-machine-learning-repo-ubuntu1604_1.0.0-1_amd64.deb
$ sudo update
$ sudo apt-get install libnccl2 libnccl-dev
```

### Fund EMT
- Create your Ethereum account (address) using MetaMask or other tool.
- Export and keep the private key for the address.
- Fund some EMT token to your node address.

## Emeth-node Setup
### Clone the repository code
```
$ git clone <repository path>
```

If you setup a master node and a worker node one one machine, clone the repository to 2 different directories.

Example:
```
$ git clone <repository path> emeth-master
$ git clone <repository path> emeth-worker
```

### Config file
[master node]
```
$ cd emeth-master
$ cp src/config/master.json.example src/config/master.json
$ vi src/config/master.json
```
| Parameter | Description | Memo |
| --------- | ---------------------------------------- | ---------------------------------------- |
| emethContractAddress | Emeth contract address |
| tokenContractAddress | Token contract address |
| endpoint | Ethereum node endpoint(Web socket) |
| privateKey | Your Ethereum account private key |
| storageApi | Emeth storage api endpoint |
| batchSize | Batch size |
| n_epochs | Epoch num |
| device | 'cuda:n' (for using gpu:n) or 'cuda' (for using all gpu) or 'cpu' (for using cpu) | Since master does not high perform calculations that require GPU, basically 'cpu' is recommended as the setting value.
| myIp | Master node's IP address (127.0.0.1) for local master/worker connection |

[worker node]
```
$ cd ~/emeth-worker
$ cp src/config/worker.json.example src/config/worker.json
$ vi src/config/worker.json
```
| Parameter | Description |
| --------- | ---------------------------------------- |
| batchSize | Batch size |
| n_epochs | Epoch num |
| device | 'cuda:n' (for using gpu:n) or 'cuda' (for using all gpu) or 'cpu' (for using cpu) |
| myIp | Worker node's IP address (127.0.0.1) for local master/worker connection |
| masterIp | Master node's IP address (127.0.0.1) for local master/worker connection |
| powerCapacity | Power capacity |

### Install packages
Both for master and worker
```
$ npm install
```
It get a scrypt installation error but there is no problem in operation. 
```
make: *** [Release/obj.target/scrypt/src/node-boilerplate/scrypt_params_async.o] Error 1
gyp ERR! build error 
gyp ERR! stack Error: `make` failed with exit code: 2
gyp ERR! stack     at ChildProcess.onExit (/Users/satoshi/.nvm/versions/node/v14.16.1/lib/node_modules/npm/node_modules/node-gyp/lib/build.js:194:23)
gyp ERR! stack     at ChildProcess.emit (events.js:315:20)
gyp ERR! stack     at Process.ChildProcess._handle.onexit (internal/child_process.js:277:12)
gyp ERR! System Darwin 20.4.0
gyp ERR! command "/Users/satoshi/.nvm/versions/node/v14.16.1/bin/node" "/Users/satoshi/.nvm/versions/node/v14.16.1/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js" "rebuild"
gyp ERR! cwd /Users/satoshi/Documents/alt/Emeth/opening-phase/emeth-node/node_modules/scrypt
gyp ERR! node -v v14.16.1
gyp ERR! node-gyp -v v5.1.0
gyp ERR! not ok 
npm WARN optional SKIPPING OPTIONAL DEPENDENCY: scrypt@6.0.3 (node_modules/scrypt):
npm WARN optional SKIPPING OPTIONAL DEPENDENCY: scrypt@6.0.3 install: `node-gyp rebuild`
npm WARN optional SKIPPING OPTIONAL DEPENDENCY: Exit status 1
```

### Build
Both for master and worker
```
$ npm run build
```

## Run Emeth-node
### Launch Master node
Execute under master node directory.
```
node dist/cli.js master
```

### Launch Worker node
Execute under worker node directory.
```
node dist/cli.js worker
```

### Attach
Execute under master node directory after starting master and worker.
```
node dist/cli.js attach
```

### Dettach
Execute under master node directory.
```
node dist/cli.js dettach
```

### Withdraw
Execute under master node directory.
```
node dist/cli.js withdraw
```

### Job list
Execute under master node directory.
```
node dist/cli.js joblist
```
