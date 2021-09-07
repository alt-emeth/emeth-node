import express from 'express'
import { DatabaseMiddlewareArguments } from './database'
import { Arguments } from 'yargs'

export default function masterApi (args: Arguments): void {
  const db = (args as unknown as DatabaseMiddlewareArguments).db
  const port = args.port

  const app = express()

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
  })
  
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  
  const router = express.Router()
  
  router.post('/api/v1/connect', (req, res, next) => {
    (async () => {
      const worker = await db('workers').where({
        ipAddress: req.body.ipAddress,
        port: req.body.port
      }).first()
  
      if (worker != null) {
        await db('workers').update({
          batchSize: req.body.batchSize,
          powerCapacity: req.body.powerCapacity
        }).where({
          ipAddress: req.body.ipAddress,
          port: req.body.port
        })
      } else {
        await db('workers').insert({
          ipAddress: req.body.ipAddress,
          port: req.body.port,
          batchSize: req.body.batchSize,
          powerCapacity: req.body.powerCapacity
        })
      }
  
      res.send({ result: 'OK' })
    })().catch(next)
  })
  
  app.use(router)
  
  app.listen(port, () => {
    console.log(`Master listening on port ${port}!`)
  }).timeout = 1000 * 60 * 30
}
