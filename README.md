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
Fund some EMT token to your node address (corresponding to the private key configured in config.json)

## Emeth-node Setup
### Clone or unzip the repository code
```
$ git clone <repository path>
or
$ unzip emeth-node-0.8.0.zip
```

### Config file
```
$ cp src/config/config.json.example src/config/config.json
$ vi src/config/config.json
```
| Parameter | Description |
| --------- | ---------------------------------------- |
| emethContractAddress | Emeth contract address |
| tokenContractAddress | Token contract address |
| endpoint | Ethereum node endpoint(Web socket) |
| privateKey | Your private key |
| storageApi | Emeth storage api endpoint |
| profile.powerCapacity | Power capacity |
| profile.batchSize | Batch size |
| profile.n_epochs | Epoch num |
| profile.device | 'cuda:n' (for using gpu:n) or 'cuda' (for using all gpu) or 'cpu' (for using cpu) |

Test Phase Example:
```
{
  "emethContractAddress": "0xA49B59ae7E27E4CDc31c4CdD29f2B8725cE7ac49",
  "tokenContractAddress": "0x608919fA99A5C85D8D29f74E8c0325C0FE91016B",
  "endpoint": "wss://rinkeby.infura.io/ws/v3/<your infura.io key>",
  "privateKey": "<your private key>",
  "storageApi": "ec2-52-196-43-170.ap-northeast-1.compute.amazonaws.com",
  "profile": {
    "powerCapacity": "27300",
    "batchSize": "6",
    "n_epochs": "6",
    "device": "cuda"
  }
}
```

### Install packages
```
npm install
```

### Build
```
npm run build
```

## Run Emeth-node
### Attach (in Master node)
```
node dist/cli.js attach
```

### Launch Master node
```
node dist/cli.js master
```

### Launch Worker node
```
node dist/cli.js worker
```

### Dettach (in Master node)
```
node dist/cli.js dettach
```
