import axios, { AxiosResponse } from 'axios'
import { ethers } from 'ethers'
import { joinSignature } from '@ethersproject/bytes'
import fs from 'fs'
import path from 'path'
import { Logger } from 'log4js'

const FILE_CHUNK_SIZE = 10_000_000;
interface Part {
  ETag: string
  PartNumber: number
}

async function sign (types: string[], values: any[], wallet: ethers.Wallet): Promise<string> {
  const hash = ethers.utils.solidityKeccak256(types, values)
  const signature = await wallet._signingKey().signDigest(hash)

  return joinSignature(signature)
}

const writeStreamFile = async (url: string, fileName: string): Promise<void> => {
  return await new Promise<void>((resolve, reject) => {
    axios.get(url, { responseType: 'stream' }).then((response: AxiosResponse) => {
      response.data
        .pipe(fs.createWriteStream(fileName))
        .on('close', () => {
          resolve()
        })
        .on('error', (err: Error) => {
          reject(err)
        })
    }).catch(reason => reject)
  })
}

export const getS3 = async (storageApi: string, wallet: ethers.Wallet, jobId: string, fileName: string): Promise<void> => {
  const timestamp = new Date().getTime()
  const signature = await sign(['string', 'uint256'], [jobId, timestamp], wallet)

  const res = await axios.post(`http://${storageApi}:3000/api/v1/node/signed-get-url`, {
    sig: signature,
    address: wallet.address,
    jobId,
    signedtime: timestamp
  }, {
    headers: { 'content-type': 'application/json' },
    timeout: 30 * 1000
  })

  await writeStreamFile(res.data.url, fileName)
}


const uploadParts = async(source:string, urls: Record<number, string>, jobId:string, logger:Logger) => {
  const keys = Object.keys(urls);
  const resParts = [];
  const fd = fs.openSync(source, 'r');
  const stats = fs.statSync(source);
  logger.info(`JobId:${jobId}, Start chunk upload. ${source}, Size is ${stats['size']}`);
  for (const indexStr of keys) {
    const index = parseInt(indexStr);
    const start = index * FILE_CHUNK_SIZE;
    logger.info(`JobId:${jobId}, Chunk start:${start}`);
    const bufferSize = (stats['size'] - start < FILE_CHUNK_SIZE)? stats['size'] - start : FILE_CHUNK_SIZE;
    const buff = Buffer.alloc(bufferSize);
    logger.info(`JobId:${jobId}, Buffer size:${buff.length}`);
    fs.readSync(fd, buff, 0, bufferSize, start);
    resParts.push(await axios.put(urls[index], buff));
  }
  logger.info(`JobId:${jobId}, Completed chunk upload. ${source}, Size is ${stats['size']}`);
  fs.closeSync(fd);
  return resParts.map((part, index) => ({
    ETag: (part as any).headers.etag,
    PartNumber: index + 1
  })) as Part[];
}

export const putS3 = async (storageApi: string, wallet: ethers.Wallet, jobId: string, fileName: string, logger:Logger): Promise<string> => {
  const extension = path.extname(fileName)
  const timestamp = new Date().getTime()
  const signature = await sign(['string', 'uint256'], [jobId, timestamp], wallet)
  const stats = fs.statSync(fileName);
  const partNum = stats['size'] / FILE_CHUNK_SIZE;
  logger.info(`JobId:${jobId}, Start multiPartUpload. ${fileName}, size is ${stats['size']}, partNum is ${partNum}`);
  const res = await axios.post(`http://${storageApi}:3000/api/v1/node/multipartUpload/getPutSignedUrls`, {
    sig: signature,
    jobId,
    address: wallet.address,
    signedtime: timestamp,
    partNum,
    extension
  }, {
    headers: { 'content-type': 'application/json' },
    timeout: 30 * 1000
  })

  const urls = res.data.urls;
  const uploadId = res.data.uploadId;
  logger.info(`JobId:${jobId}, Signed url. ${fileName}, url num is ${Object.keys(urls).length}`);
  const parts:Part[] = await uploadParts(fileName, urls, jobId, logger);
  logger.info(`JobId:${jobId}, Completed parts upload. ${fileName}`);
  await axios.post(`http://${storageApi}:3000/api/v1/node/multipartUpload/completeUpload`, {
    jobId,
    address: wallet.address,
    parts,
    uploadId,
    extension
  }, {
    headers: { 'content-type': 'application/json' },
    timeout: 30 * 1000
  });
  logger.info(`JobId:${jobId}, Completed multipartUpload. ${fileName}`);
  return res.data.fileName
}
