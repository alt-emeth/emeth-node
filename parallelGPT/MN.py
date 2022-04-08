"""
Simple training loop; Boilerplate that could apply to any arbitrary neural network,
so nothing in this file really has anything to do with GPT specifically.
"""

import math
import logging
import os
import argparse
import requests
import sys
import netifaces
from tqdm import tqdm
import numpy as np
from typing import Dict, List, Tuple
import torch
import re, time
import torch.optim as optim
from torch.optim.lr_scheduler import LambdaLR
from torch.utils.data.dataloader import DataLoader
from torch.nn.modules import Module
import torch.utils.data.distributed 
import torch.distributed as dist
from torch.autograd import Variable
from torch.utils.data import Dataset
from datetime import timedelta
from data_loader import get_data_loader
from transformers import GPT2LMHeadModel, GPT2Tokenizer, AutoModelForCausalLM, T5Tokenizer
from pytorch_pretrained_bert import  OpenAIAdam, BertTokenizer, cached_path
from model_sampler import print_samples
from hashlib import sha256
import sys
import signal
logger = logging.getLogger(__name__)

class DistributedDataParallel(Module):
  def __init__(self, module):
    super(DistributedDataParallel, self).__init__()
    self.module = module
    self.first_call = True

    def allreduce_params():
      if self.needs_reduction:
        self.needs_reduction = False  # pylint: disable = attribute-defined-outside-init
        buckets = {}
        for param in self.module.parameters():
          if param.requires_grad and param.grad is not None:
            tp = type(param.data)
            if tp not in buckets:
              buckets[tp] = []
            buckets[tp].append(param)
        for tp in buckets:
          bucket = buckets[tp]
          grads = [param.grad.data for param in bucket]
          coalesced = _flatten_dense_tensors(grads)
          dist.all_reduce(coalesced)
          coalesced /= dist.get_world_size()
          for buf, synced in zip(grads, _unflatten_dense_tensors(coalesced, grads)):
            buf.copy_(synced)

    for param in list(self.module.parameters()):
      def allreduce_hook(*unused):  # pylint: disable = unused-argument
        Variable._execution_engine.queue_callback(allreduce_params)  # pylint: disable = protected-access

      if param.requires_grad:
        param.register_hook(allreduce_hook)

  def weight_broadcast(self):
    for param in self.module.parameters():
      dist.broadcast(param.data, 0)

  def forward(self, *inputs, **kwargs):  # pylint: disable = arguments-differ
    if self.first_call:
      logging.info("first broadcast start")
      self.weight_broadcast()
      self.first_call = False
      logging.info("first broadcast done")
    self.needs_reduction = True  # pylint: disable = attribute-defined-outside-init
    return self.module(*inputs, **kwargs)

class TrainerConfig:
    # optimization parameters
    max_epochs = 10
    batch_size = 64
    learning_rate = 3e-4
    betas = (0.9, 0.95)
    grad_norm_clip = 1.0
    weight_decay = 0.1 # only applied on matmul weights
    # learning rate decay params: linear warmup followed by cosine decay to 10% of original
    lr_decay = False
    warmup_tokens = 375e6 # these two numbers come from the GPT-3 paper, but may not be good defaults elsewhere
    final_tokens = 260e9 # (at what point we reach 10% of original LR)
    # checkpoint settings
    ckpt_path = None
    num_workers = 0 # for DataLoader

    def __init__(self, **kwargs):
        for k,v in kwargs.items():
            setattr(self, k, v)

class ModelBuffer(object):
    def __init__(self, network):
        """
        this class is used to save model weights received from parameter server
        current step for each layer of model will also be updated here to make sure
        the model is always up-to-date
        """
        super(ModelBuffer, self).__init__()
        self.recv_buf = []
        self.layer_cur_step = []
        self.layer_shape = []
        '''
        initialize space to receive model from parameter server
        '''
        # consider we don't want to update the param of `BatchNorm` layer right now
        # we temporirially deprecate the foregoing version and only update the model
        # parameters
        for param_idx, param in enumerate(network.parameters()):
            self.recv_buf.append(torch.zeros(param.size()))


class Trainer:

    def __init__(self, model,path, train_dataset, test_dataset, config, master, port, time,device,vocab,num_workers, data_input, key, jid):
        self.model = model
        self.train_dataset = train_dataset
        self.test_dataset = test_dataset
        self.config = config
        self.port = port
        self.master =  master
        self.time = time   
        self.device = device
        self.path = path
        self.vocab = vocab
        self.num_workers = num_workers
        self.epc = torch.from_numpy(np.array([0], dtype=np.float)).float()
        self.lss = torch.from_numpy(np.array([0], dtype=np.float)).float()
        self.hed = torch.from_numpy(np.zeros(64, dtype=np.int32)).int()
        self.prevhash = "5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9"
        self.data_input = data_input
        self.jobID = jid
        self.secret = key
        backend = 'tcp://'
        masterurl = backend+self.master+':'+self.port
        logging.info("running master %s", masterurl)
        dist.init_process_group(backend='gloo',init_method=masterurl,world_size=self.num_workers,rank=0, timeout=timedelta(seconds=self.time))
        # take over whatever gpus are on the system
        self.device = device
        if torch.cuda.is_available():
            #self.device = torch.device('cuda:0')
            self.device = device
            self.model = self.model.to(self.device)
            #self.model = torch.nn.parallel.DistributedDataParallel(self.model, device_ids=[0], find_unused_parameters=True)        
            #self.model = torch.nn.DataParallel(self.model).to(self.device)
    def _model_update(self):
        # gradient shipped from workers are averaged and update the model
        self._grad_aggregate_buffer = [x / self._num_workers for x in self._grad_aggregate_buffer]
        self.optimizer.step(grads=self._grad_aggregate_buffer)        

    def _bcast_weight(self):
        for layer_idx, layer in enumerate(self.model.parameters()):
            layer_weight = layer.detach()
            dist.broadcast(layer_weight, src=0)

    def final_checkpoint(self):
        # DataParallel wrappers keep raw model object in .module attribute
        if os.path.exists(self.config.ckpt_path):
            logging.info('{"status": "COMPLETED", "fileName":"%s"}', self.config.ckpt_path)

    def aggregate_gradient(self, layer_idx, gradient):
        self._grad_aggregate_buffer[layer_idx] = reduce((lambda x, y: x + y), gradient[1:])

    def _recv_grads(self):
        for layer_idx, layer in enumerate(self.model.parameters()):
            dummpy_grad = self.grad_accumulator.gradient_aggregator[layer_idx][0]
            dist.gather(dummpy_grad, self.grad_accumulator.gradient_aggregator[layer_idx], dst=0)
            self.aggregate_gradient(layer_idx=layer_idx, gradient=self.grad_accumulator.gradient_aggregator[layer_idx])

    def save_checkpoint(self, optimizer, epoch):
        # DataParallel wrappers keep raw model object in .module attribute
        raw_model = self.model.module if hasattr(self.model, "module") else self.model
        lss = self.lss
        ffhash = self.prevhash
        #logger.info(optimizer.param_groups)
        #torch.save(raw_model.state_dict(), self.config.ckpt_path)
        print(epoch)
        torch.save({
            'epoch': epoch,
            'model_state_dict': raw_model.state_dict(),
            'loss': lss,
            'hash': ffhash,
            }, self.config.ckpt_path)
        logger.info("saving %s", self.config.ckpt_path)
        logging.info('{"status": "COMPLETED", "fileName":"%s"}', self.config.ckpt_path)
        logging.info('{" last hash ":"%s"}', ffhash)
    


    def train(self):
        model, config, device, epc, lss, prevhash, data_input, jobID, secret, hed  = self.model, self.config, self.device, self.epc, self.lss, self.prevhash, self.data_input, self.jobID, self.secret, self.hed
        param_optimizer = list(model.named_parameters())
        no_decay = ['bias', 'LayerNorm.bias', 'LayerNorm.weight']
        optimizer_grouped_parameters = [
            {'params': [p for n, p in param_optimizer if not any(nd in n for nd in no_decay)], 'weight_decay': 0.01},
            {'params': [p for n, p in param_optimizer if any(nd in n for nd in no_decay)], 'weight_decay': 0.0}
            ]
        num_train_optimization_steps = self.vocab * self.config.max_epochs // self.config.batch_size
        optimizer = OpenAIAdam(optimizer_grouped_parameters,
                               lr=self.config.learning_rate,
                               warmup=0.002,
                               max_grad_norm=self.config.grad_norm_clip,
                               weight_decay=self.config.weight_decay,
                               t_total=num_train_optimization_steps)
        data = self.train_dataset
        #optimizer = optim.AdamW(optim_groups, lr=config.learning_rate, betas=config.betas)
        logging.info("connected, train started")
        #enc = GPT2Tokenizer.from_pretrained('gpt2')
        #loader = get_data_loader(data, enc, config.batch_size, 128, self.path)
        def resetmodel(model, prevhash):
            for param in model.parameters():
                torch.distributed.barrier()
                param.data = torch.zeros(param.data.size()).to(device)
            #print(model)
            '''
            for hs in prevhash:
                torch.distributed.barrier()
                hs = torch.zeros(hs.size())
                #print(hs)
            '''
            prevhash = torch.zeros(prevhash.size())
            

        def average_gradients(model, epc, lss, hed):
            """ Gradient averaging. """
            print("send tensor to master")
            size = float(dist.get_world_size()) - 1
            #group = dist.new_group([0])
            req = None
            hlist = 0
            tlist = 0
            for param in model.parameters():
                torch.distributed.barrier()
                
                dist.reduce(param.data, dst=0, op=dist.reduce_op.SUM)
                dist.reduce(epc, dst=0, op=dist.reduce_op.SUM)
                dist.reduce(lss, dst=0, op=dist.reduce_op.SUM)
                #gather(param.data, dst = 0)
                #dist.gather(param.data, gather_list=tlist)
                #req.wait()
                #dist.reduce(tensor, 0, op=dist.reduce_op.SUM, group=group)
                #dist.all_reduce(param.grad.data, op=dist.ReduceOp.SUM, group=group)
                #prevhash //= int(size)
                epc /= size
                param.data /= size
                lss /= size
                tlist+=1
                torch.distributed.barrier()
                dist.broadcast(param.data, src=0)
                #torch.distributed.barrier()
                #param.data = torch.zeros(param.data.size()).to(args.device)
            epc /= tlist
            lss /= tlist
            #prevhash = prevhash
                #print(hs)
            #prevhash //= hlist
            #print(prevhash)
            #prevhash //=tlist
            #print(prevhash)
            #print(prevhash)
            #np_arr = prevhash.cpu().detach().numpy()
            #print(np_arr)
        
        best_loss = float('inf')
        self.tokens = 0 # counter used for learning rate decay
        for epoch in range(config.max_epochs):
            #print(epoch)
            #print(prevhash)
            resetmodel(model, hed)
            #print(prevhash)
            logging.info("waiting result")
            torch.distributed.barrier()
            average_gradients(model, epc, lss, hed)
            logger.info("model received from worker")
            if epoch == 0:
                inpt = " ".join(data_input)
                datahash = sha256(inpt.encode('utf-8')).hexdigest()
                has = sha256((datahash + secret).encode('utf-8')).hexdigest()
                logging.info('{"hash":"%s","epoch": "%s"}', has, epoch+1)
                self.prevhash = has
            else:
                nhash = sha256((self.prevhash + str(epoch) + secret).encode('utf-8')).hexdigest()
                logging.info('{"previous":"%s","hash":"%s","epoch": "%s"}', self.prevhash,nhash, epoch+1)
                self.prevhash = nhash
            #logger.info(model)
            #print(model)
            #sample = print_samples(model, enc, self.device,context_tokens=next(iter(loader)),batch_size=1, length=200, nsamples=1,temperature=1, top_k=40)
        start = time.time()
       	self.save_checkpoint(optimizer,self.epc)
        print(time.time() - start)

class CharDataset(Dataset):

    def __init__(self, data, block_size):
        chars = sorted(list(set(data)))
        data_size, vocab_size = len(data), len(chars)
        print('data has %d characters, %d unique.' % (data_size, vocab_size))
        
        self.stoi = { ch:i for i,ch in enumerate(chars) }
        self.itos = { i:ch for i,ch in enumerate(chars) }
        self.block_size = block_size
        self.vocab_size = vocab_size
        self.data = data
    
    def __len__(self):
        return len(self.data) - self.block_size

    def __getitem__(self, idx):
        # grab a chunk of (block_size + 1) characters from the data
        chunk = self.data[idx:idx + self.block_size + 1]
        # encode every character to an integer
        dix = [self.stoi[s] for s in chunk]
        """
        arrange data and targets so that the first i elements of x
        will be asked to predict the i-th element of y. Notice that
        the eventual language model will actually make block_size
        individual predictions at the same time based on this data,
        so we are being clever and amortizing the cost of the forward
        pass of the network. So for example if block_size is 4, then
        we could e.g. sample a chunk of text "hello", the integers in
        x will correspond to "hell" and in y will be "ello". This will
        then actually "multitask" 4 separate examples at the same time
        in the language model:
        - given just "h", please predict "e" as next
        - given "he" please predict "l" next
        - given "hel" predict "l" next
        - given "hell" predict "o" next
        
        In addition, because the DataLoader will create batches of examples,
        every forward/backward pass during traning will simultaneously train
        a LOT of predictions, amortizing a lot of computation. In particular,
        for a batched input of integers X (B, T) where B is batch size and
        T is block_size and Y (B, T), the network will during training be
        simultaneously training to make B*T predictions, all at once! Of course,
        at test time we can paralellize across batch B, but unlike during training
        we cannot parallelize across the time dimension T - we have to run
        a forward pass of the network to recover the next single character of the 
        sequence along each batch dimension, and repeatedly always feed in a next
        character to get the next one.
        
        So yes there is a big asymmetry between train/test time of autoregressive
        models. During training we can go B*T at a time with every forward pass,
        but during test time we can only go B at a time, T times, with T forward 
        passes.
        """
        x = torch.tensor(dix[:-1], dtype=torch.long)
        y = torch.tensor(dix[1:], dtype=torch.long)
        return x, y
def weights_init(m):
    if isinstance(m, torch.nn.Conv2d):
        torch.nn.init.xavier_uniform_(m.weight)
        torch.nn.init.zeros_(m.bias)

def signal_handler(sig, frame):
    print('fantastic exit!')
    sys.exit(0)
    
class WordDataset(Dataset):

    def __init__(self, data, block_size):
        words = sorted(list(set(data)))
        data_size, vocab_size = len(data), len(words)
        print('data has %d words, %d unique.' % (data_size, vocab_size))
        
        self.stoi = { ch:i for i,ch in enumerate(words) }
        self.itos = { i:ch for i,ch in enumerate(words) }
        self.block_size = block_size
        self.vocab_size = vocab_size
        self.data_size = data_size
        self.data = data
    
    def __len__(self):
        return len(self.data) - self.block_size

    def __getitem__(self, idx):
        # grab a chunk of (block_size + 1) characters from the data
        chunk = self.data[idx:idx + self.block_size + 1]
        # encode every word to an integer
        dix = [self.stoi[s] for s in chunk]
        """
        # See https://github.com/karpathy/minGPT/blob/master/play_char.ipynb for
        # explainer of Dataset construction
        """
        x = torch.tensor(dix[:-1], dtype=torch.long)
        y = torch.tensor(dix[1:], dtype=torch.long)
        return x, y

    
    
    
def main():
    
    train = []
    test = []
    parser = argparse.ArgumentParser()
    block_size = 128 
    # Required parameters
    parser.add_argument(
        "--train_data_file", default=None, type=str, required=True, help="The input training data file (a text file)."
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        required=True,
        help="The output directory where the model predictions and checkpoints will be written.",
    )
    parser.add_argument("--worker_ip_list", type=str, default="", help="For distant debugging.")
    parser.add_argument("--master_ip", type=str, default="", help="For distant debugging.")
    parser.add_argument("--master_port", type=str, default="", help="For distant debugging.")
    parser.add_argument("--log_file", type=str, default="", help="For distant debugging.")
    parser.add_argument("--timeout", type=str, default="", help="For distant debugging.")
    parser.add_argument("--test_data", type=str, default="", help="For distant debugging.")
    parser.add_argument("--dataset_cache", type=str, default='./dataset_cache_gist', help="Path or url of the dataset cache")
    parser.add_argument("--train_batch_size", type=int, default=16, help="Batch size for training")
    parser.add_argument("--n_epochs", type=int, default=20, help="Number of training epochs")
    parser.add_argument("--num_workers", type=int, default=2, help="Number of training epochs")
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu", help="Device (cuda or cpu)")
    parser.add_argument("--language", type=str, default='en', help="language option")
    #parser.add_argument("--key", type=str, default='en', help="language option")
    #parser.add_argument("--jobid", type=str, default='en', help="language option")
    args = parser.parse_args()
    logging.basicConfig(filename=sys.argv[12],
                            filemode='a',
                            format='%(message)s',
                            datefmt='%H:%M:%S',
                            level=logging.DEBUG)
    net_inf = netifaces.gateways()['default'][netifaces.AF_INET][1]
    logger.info("using interface %s", net_inf)
    os.environ['TF_SOCKET_IFNAME'] = net_inf
    os.environ['TP_SOCKET_IFNAME'] = net_inf
    os.environ['GLOO_SOCKET_IFNAME'] = net_inf

    #text = open(sys.argv[2], 'r').read() # don't worry we won't run out of file handles
    if not os.path.exists(sys.argv[4]):
        os.makedirs(sys.argv[4])
    master_ip = ''
    try:
        r = requests.get('http://httpbin.org/ip', timeout=5)
        master_ip = r.json()['origin']
        print("master IP ", master_ip)
    except Exception as e:
        err = u"{0}".format(e)
    logging.info(sys.argv)
    ip_list = open(sys.argv[6], 'r').read() # don't worry we won't run out of file handles
    #train_dataset = CharDataset(text, block_size) # one line of poem is roughly 50 characters
    devicename = sys.argv[20]
    language = sys.argv[28]
    #print(f"GPU : {devicename}")
    # initialize a trainer instance and kick off training
    #mconf = GPTConfig(train_dataset.vocab_size, train_dataset.block_size,
    #              n_layer=12, n_head=12, n_embd=768)
    #model = GPT(mconf)
    with open(sys.argv[2], "r") as f:
        for line in f:
            test.extend(line.split())
    #f = lambda x: x.strip().replace("\n"," ")+" #EOS"
    #test = [f(x) for x in test]
    # seperate all words and punctuation
    #test = [re.findall(r"[\w']+|[.,!?;]", x) for x in test]
    # turn list of lists in to single list
    #test = [j for i in test for j in i]
    #test_str='.'.join(test)
    #with open("pt.txt", "w") as valid_file:
    #    valid_file.write(test_str)
    #print(abstract)

    train_dataset = WordDataset(test, block_size) 
    #print(f"GPU : {devicename}")
    # initialize a trainer instance and kick off training
    #mconf = GPTConfig(train_dataset.vocab_size, train_dataset.block_size,
    #              n_layer=12, n_head=12, n_embd=768)
    #model = GPT(mconf)
    logging.info('vocab size : %s',str(train_dataset.vocab_size))
    vocab_size = train_dataset.vocab_size
    if language == 'en':
        model = GPT2LMHeadModel.from_pretrained('gpt2-medium')
    elif language == 'ja':
        model = AutoModelForCausalLM.from_pretrained('rinna/japanese-gpt2-medium')
    model.apply(weights_init)
    out = sys.argv[4] + 'checkpoint.pt'
    nepoch = int(sys.argv[22])
    num_workers = int(sys.argv[26]) + 1
    key = '4ff8f937b496feeba880834927d2b6e3110355ee6fddae6bad88124a84560911'
    jid = 0
    try:
        tconf = TrainerConfig(max_epochs=nepoch, batch_size=int(sys.argv[18]), learning_rate=2.5e-4,
                      lr_decay=True, warmup_tokens=512*20, final_tokens=nepoch*vocab_size*block_size,
                      num_workers=16, ckpt_path = out)
        trainer = Trainer(model,sys.argv[4], sys.argv[2], sys.argv[16], tconf, sys.argv[10], sys.argv[8],int(sys.argv[14]), devicename,train_dataset.data_size,num_workers, test, key, jid)
        trainer.train()
    except RuntimeError as err:
        logging.info('{"status": "FAILED", "error":"%s"}', err)
    
    
    print('training done')

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    main()
