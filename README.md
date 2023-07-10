# emeth-node

## Prerequisite
### OS configuration
The guideline for the required memory is as follows.

- worker: About 17GB


The following is an example of creating a swap area of 50GB on ubuntu.

```
$ sudo fallocate -l 50G /swapfile
$ sudo chmod 600 /swapfile
$ sudo mkswap /swapfile
$ sudo swapon /swapfile

# Setting to be valid even after rebooting
$ sudo vi /etc/fstab
 # Add the following. 
 /swapfile swap swap defaults 0 0

# Check configuration
$ sudo swapon --show
$ sudo free -h 
```

### node & npm version
```
$ node -v
v18.16.1

$ npm -v
9.5.1
```

### GPU setup
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

### Config file
[worker node]
```
$ cd ~/emeth-worker
$ cp src/config/worker.json.example src/config/worker.json
$ vi src/config/worker.json
```
| Parameter | Description | Memo |
| --------- | ---------------------------------------- | ---------------------------------------- |
| device | 'cuda:n' (for using gpu:n) or 'cuda' (for using all gpu) or 'cpu' (for using cpu) |
| my_url | Worker node's endpoint(FQDN) for master/worker connection |
| master_node_url | Master node's endpoint(FQDN) for master/worker connection |
| powerCapacity | Power capacity |
| privateKey | Ethereum account private key(Optional) | If omitted, a random account will be generated at the first startup, and it will be reused thereafter.
| timeout | If the process stops in the phases during learning, time out and it move to the next job. You can specify the milliseconds before timeout in here. | "wait_data" (Waiting recieve dataset). Default is 300000. "idle" (Idling python process). Default is 600000. "learning" (Learning job). Default is 10000. "checkpoint" (Waiting synchronize the intermediate results with the master and move on to the next epoch). Default is 1200000.

### Install packages
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
```
$ npm run build
```

## Run Emeth-node
### Launch Worker node
Execute under worker node directory.
```
node dist/cli.js worker
```

### Job list
Execute under master node directory.
```
node dist/cli.js joblist
```
