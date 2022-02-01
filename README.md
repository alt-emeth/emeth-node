# emeth-node

## Prerequisite
### OS configuration
The guideline for the required memory is as follows.

- master: About, 10GB × Number of workers. (* If a worker coexists, an additional 17GB is required)

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
| endpoint | Ethereum node endpoint(https) |
| privateKey | Your Ethereum account private key |
| storageApi | Emeth storage api endpoint |
| batchSize | Batch size |
| n_epochs | Epoch num |
| device | 'cuda:n' (for using gpu:n) or 'cuda' (for using all gpu) or 'cpu' (for using cpu) | Since master does not high perform calculations that require GPU, basically 'cpu' is recommended as the setting value.
| my_url | Master node's endpoint(FQDN) for master/worker connection |
| worker_whitelist | worker whiltelist(ip address) for master/worker connection. It can be grant permission to anywhere server by asterisk of wild card. | Default is * (anywhere).
| jsonrpc_whitelist | You can operate commands from the outside by sending a json rpc request from the allowed whitelist here. | Default is 127.0.0.1 (local). 
| external_db | MySql connection information (optional). | By specifying the connection information of MySql here, you can save queue that controls the execution order of jobs to an external MySql. If omitted, it will be queued as local sqlite3 data.
| cooperative | '1v1' (Assign one worker to one job) or 'nvm' (Assign worker(s) who meets the required power capacity for one job) | Default is 'nvm'.
| board_url | board server endpoint(FQDN)
| min_fee | minimum fee for job matching | Default is 10000000000000000000
| max_fee | maximum fee for job matching | Default is 30000000000000000000

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

### JSON RPC
You can operate commands from the outside by sending a json rpc request to the master node.

```
{master_node_url}/api/json-rpc
```

```
--> {
	"jsonrpc": "2.0",
	"method": "disconnect",
	"params": {"workerAddress": '0x...'},
	"id": 1
    }
<-- {
	"jsonrpc": "2.0",
	"result": "disconnected",
	"id": 1
    }
```

| Method | Description | Params |
| --------- | ---------------------------------------- | ---------------------------------------- |
| disconnect | Disconnects the specified worker of eth address from master. eth address is the account specified in worker.json or the account randomly generated at the first startup. | {"workerAddress": worker's eth address}
