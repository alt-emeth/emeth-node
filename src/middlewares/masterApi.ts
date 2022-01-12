import express, { NextFunction } from 'express'
import { DatabaseMiddlewareArguments } from './database'
import { Arguments } from 'yargs'
import { Logger } from 'log4js'
import AccessControl from 'express-ip-access-control'
import { Wallet } from '@ethersproject/wallet'
import { verify } from '../lib/crypto'
import { ParamsDictionary, Request, Response } from 'express-serve-static-core'
import QueryString from 'qs'
import { JSONRPCError, JSONRPCReponse, JSONRPCRequest } from '../types/api'
import { ProcessHolder } from './exit-handler'

const AUTH_EXPIRE = 1000 * 60

const createAccessControlOption = (whitelist:string[], logger:Logger) => {
  whitelist = (whitelist).map(ip => (ip === 'localhost')? '127.0.0.1': ip)

  const options: AccessControl.AclOptions = {
    mode: (whitelist[0] === '*')? 'deny': 'allow',
    denys: [],
    allows: whitelist,
    forceConnectionAddress: false,
    log: (clientIp, access) => { logger.info(clientIp + (access ? ' accessed.' : ' denied.')) },
    statusCode: '401',
    redirectTo: '',
    message: 'Unauthorized'
  }

  return options
}

export default function masterApi (args: Arguments): void {
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const logger = args.logger as Logger
  const port = new URL(args.my_url as string).port
  const wallet = args.wallet as Wallet
  const processHolder = (args.processHolder as ProcessHolder)

  const app = express()

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
  })

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  const router = express.Router()

  const workerAccessControl = AccessControl(createAccessControlOption(args.worker_whitelist as string[], logger))

  const jsonrpcAccessControl = AccessControl(createAccessControlOption(args.jsonrpc_whitelist as string[], logger))

  const isJSONRPCRequest = (args: JSONRPCRequest): args is JSONRPCRequest => 
    args.jsonrpc !== undefined && args.method !== undefined && args.id !== undefined

  router.post('/api/json-rpc', jsonrpcAccessControl, (req, res, next) => {
    (async () => {

      if(!isJSONRPCRequest(req.body) || req.body.jsonrpc !== '2.0') {
        res.send({
          jsonrpc:'2.0', 
          error: { 
            code: -32600, 
            message: "server error. invalid json-rpc. not conforming to spec."
          }, 
          id: req.body.id 
        } as JSONRPCError)

        return
      }

      const request:JSONRPCRequest = req.body

      switch(request.method) {
        case 'disconnect':
          const param = request.param

          let result
          const trx = await db.transaction()
          const worker = await trx('workers').where('address', param.workerAddress).first()
          if(worker) {
            await trx('workers').delete().where('address', param.workerAddress)
            result = "disconnected"
          } else {
            result = "not exist"
          }
          await trx.commit()

          const jobId = processHolder.processingJobId(param.workerAddress)
          if(jobId) processHolder.cleanProcess(jobId, wallet)

          if(request.id) {
            const response:JSONRPCReponse = {
              jsonrpc: '2.0',
              result,
              id: request.id
            }
            res.send(response)
          } else {
            res.send()
          }

          break
        default:
          res.send({
            jsonrpc:'2.0', 
            error: { 
              code: -32601, 
              message: "server error. requested method not found"
            }, 
            id: req.body.id 
          } as JSONRPCError)

          return
      }
    })().catch(next)
  })

  router.get('/api/v1/connected', (req, res, next) => {
    (async () => {
      const url = req.query.url as string
      const worker = await db('workers').where({url: url}).first()
      const connected = (worker)? true : false
      res.send({ result: connected })
    })().catch(next)
  })

  router.post('/api/v1/connect', workerAccessControl, (req, res, next) => {
    (async () => {
      if(req.body.address && req.body.signedtime && req.body.sig) {
        if(new Date().getTime() - req.body.signedtime > AUTH_EXPIRE) {
          const error = new Error('Timestamp expired.') as any
          error.code = 401
          throw error
        }
      
        if(!verify(['uint256'], [req.body.signedtime], req.body.address, req.body.sig)) {
          const error = new Error('Unauthorized.') as any
          error.code = 401
          throw error
        }
      }

      const worker = await db('workers').where({url: req.body.url}).first()
  
      if (worker != null) {
        await db('workers').update({
          address: req.body.address,
          power_capacity: req.body.powerCapacity
        }).where({url: req.body.url})
      } else {
        await db('workers').insert({
          url :req.body.url,
          address: req.body.address,
          power_capacity: req.body.powerCapacity
        })
      }
  
      res.send({ url: args.my_url, address:  wallet.address})
    })().catch(next)
  })
  
  app.use(router)
  
  app.use((
    err:any, 
    req:Request<ParamsDictionary, any, any, QueryString.ParsedQs, Record<string, any>>, 
    res:Response<any, Record<string, any>, number>,
    next:NextFunction
    )=> {
    res.status(err.code || 500).send(err.message);
  })

  app.listen(port, () => {
    console.log(`Master listening on port ${port}!`)
  }).timeout = 1000 * 60 * 30
}
