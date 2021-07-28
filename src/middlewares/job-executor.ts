import axios from 'axios'
import delay from 'delay'
import fs from 'fs'
import interval from 'interval-promise'
import { Logger } from 'log4js'
import makeDir from 'make-dir'
import os from 'os'
import path from 'path'
import portfinder from 'portfinder'
import { Arguments } from 'yargs'

import { ContractsMiddlewareArguments } from './contracts'
import { DatabaseMiddlewareArguments } from './database'
import { MODE } from '../lib/consistants'
import { execSplitter, launchMasterNode } from '../lib/parallel-gpt'
import { getS3, putS3 } from '../lib/storage'
import { JobStatus, Worker } from '../types/tables'
import { WalletMiddlewareArguments } from './wallet'
import { collectCandidateWorkerInfo, findAvailableWorkers, killWorkers, uploadFileToWorker } from '../lib/workers'

export default function jobExecutor (args: Arguments): void {
  const logger = args.logger as Logger
  const parallelGPTPath = args.parallelGPTPath as string
  const storageApi = args.storageApi as string

  const contracts = (args as unknown as ContractsMiddlewareArguments).contracts
  const wallet = (args as unknown as WalletMiddlewareArguments).wallet
  const db = (args as unknown as DatabaseMiddlewareArguments).db

  interval(async () => {
    const job = await db('jobs').where('status', JobStatus.ASSIGNED).andWhere('assignedNode', wallet.address).orderBy('createdAt').first()
    if (job === undefined) {
      return
    }

    const jobId = job.jobId

    let usedWorkers: Worker[] = []

    try {
      const jobIdBytes = Buffer.from(jobId.slice(2), 'hex')

      const job = await contracts.emeth.jobs(jobIdBytes)
      const jobAssign = await contracts.emeth.jobAssigns(jobIdBytes)

      console.log(`JobId:${jobId}, job exist:${String(job.exist)}, job status:${String(job.status)}`)

      console.log(`JobId:${jobId}, assigned node:${jobAssign.node}, my address:${wallet.address}`)
      if (jobAssign.node !== wallet.address) {
        await db('jobs').where({ jobId }).update({
          assignedNode: jobAssign.node,
          updatedAt: new Date().getTime()
        })
        throw new Error(`JobId:${jobId}, This is not assigned`)
      }

      if (job.status.toNumber() === JobStatus.REQUESTED || job.status.toNumber() === JobStatus.FAILED) {
        await db('jobs').where({ jobId }).update({
          status: job.status.toNumber(),
          updatedAt: new Date().getTime()
        })

        const message = (job.status.toNumber() === JobStatus.REQUESTED) ? 'job returned to request' : 'job failed'
        throw new Error(`JobId:${jobId}, ${message} due to timeout. updated localy caching data.`)
      }

      if (job.status.toNumber() !== JobStatus.ASSIGNED) {
        await db('jobs').where({ jobId }).update({
          status: job.status.toNumber(),
          updatedAt: new Date().getTime()
        })

        throw new Error(`JobId:${jobId}, This is not assign status. updated localy caching data.`)
      }

      const availableWorkers = await findAvailableWorkers(db)

      const {
        requiredPowerCapacity, havingPowerCapacity,
        candidateWorkerPowerCapacity, candidateWorkers
      } = collectCandidateWorkerInfo(availableWorkers, jobAssign)

      console.log(`JobId:${jobId},
      requredPowerCapacity:${requiredPowerCapacity.toString()},
      havingPowerCapacity:${havingPowerCapacity.toString()},
      candidateWorkerPowerCapacity:${candidateWorkerPowerCapacity.toString()},
      candidateWorkers:${candidateWorkers.toString()}`
      )
      if (candidateWorkerPowerCapacity < requiredPowerCapacity) {
        throw new Error(`JobId:${jobId}, Power capacity is not enoguh.`)
      }
      if (candidateWorkers.length === 0) {
        throw new Error(`JobId:${jobId}, candidateWorkers is zero even Power capacity is enoguh`)
      }

      usedWorkers = candidateWorkers
      console.log(`JobId:${job.jobId}, job process start`)
      console.log(`JobId:${job.jobId}, usedWorkers:${JSON.stringify(usedWorkers)}`)
      const jobDetail = await contracts.emeth.jobDetails(job.jobId)
      console.log(`JobId:${job.jobId}, job detail:${JSON.stringify(jobDetail)}`)

      for (const worker of usedWorkers) {
        await axios.post(`http://${worker.ipAddress}:3000/api/v1/waitData`)
      }

      const trainDataDir = path.join(parallelGPTPath, 'data', jobId)
      const splitDataDir = path.join(parallelGPTPath, 'split', jobId)
      const outputDir = path.join(parallelGPTPath, 'model', jobId)
      const workerIpListDir = path.join(parallelGPTPath, 'worker_ip_list')
      const datasetCacheDir = path.join(parallelGPTPath, 'dataset_cache')
      await makeDir(trainDataDir)
      await makeDir(splitDataDir)
      await makeDir(outputDir)
      await makeDir(workerIpListDir)
      await makeDir(datasetCacheDir)
      const trainDataFile = path.join(trainDataDir, jobDetail.dataset)
      const workerIpListFile = path.join(workerIpListDir, `${job.jobId}.txt`)
      const datasetCache = path.join(datasetCacheDir, jobId)
      const masterPort = await portfinder.getPortPromise({
        startPort: Math.random() * (65535 - 8000 + 1) + 8000,
        stopPort: 65535
      })

      await db('jobs').where({ jobId }).update({
        status: JobStatus.PROCESSING,
        numOfAttempt: db.raw('numOfAttempt + 1'),
        updatedAt: new Date().getTime()
      })

      await contracts.emeth.process(job.jobId)

      await getS3(storageApi, wallet, job.jobId, trainDataFile)

      await execSplitter(trainDataFile, splitDataDir + '/', usedWorkers.length, {
        logger,
        parallelGPTPath
      })

      const testDataFile = path.join(splitDataDir, 'valid.txt')
      let index = 0
      for (const worker of usedWorkers) {
        // send data to worker
        index++

        const workerDataFile = path.join(splitDataDir, `train${index}.txt`)

        await uploadFileToWorker(workerDataFile, worker, jobId)
        await uploadFileToWorker(testDataFile, worker, jobId)

        // ready worker
        const json = {
          train_data_file: `train${index}.txt`,
          test_data_file: 'valid.txt',
          master_port: masterPort,
          jobId
        }

        await axios.post(`http://${worker.ipAddress}:3000/api/v1/ready`, json)

        // waiting for idle
        await delay(10000)

        const modeRes = (await axios.get(`http://${worker.ipAddress}:3000/api/v1/mode`)).data
        if (modeRes.result !== MODE.Idle) {
          throw new Error(`JobId:${jobId}, Timeout worker process:${worker.ipAddress}`)
        }

        fs.writeFileSync(workerIpListFile, usedWorkers.map(worker => worker.ipAddress).join(os.EOL))
      }

      const masterNode = await launchMasterNode(
        jobId,
        trainDataFile,
        outputDir + '/',
        workerIpListFile,
        masterPort,
        args.myIp as string,
        jobAssign.timeLimit.toNumber(),
        testDataFile,
        args.batchSize as number,
        args.device as string,
        args.n_epochs as number,
        datasetCache as string,
        {
          logger,
          parallelGPTPath
        })

      masterNode.on('completed', async (fileName) => {
        const result = await putS3(storageApi, wallet, job.jobId, fileName, logger)
        logger.info(`JobId:${job.jobId}, Start submit: ${result}`);
        await contracts.emeth.submit(job.jobId, result)
        logger.info(`JobId:${job.jobId}, Completed submit: ${result}`);
        await db('jobs').where({ jobId }).update({
          status: JobStatus.SUBMITTED,
          updatedAt: new Date().getTime()
        })

        console.log(`JobId:${job.jobId}, job process end. fileName:${fileName}`)
      })

      masterNode.on('error', async (err) => {
        console.log(err.message)
        console.log(`Job was interrupted due to an unexpected error. jobId:${job.jobId}`)

        await killWorkers(usedWorkers)
      })
    } catch (e) {
      console.log(e.message)
      await killWorkers(usedWorkers)
    }
  }, 1000, {
    stopOnError: false
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  }) as unknown as void
}
