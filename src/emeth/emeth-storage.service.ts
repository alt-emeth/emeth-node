import * as AdmZip from 'adm-zip';
import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as stream from 'stream';
import * as tmp from 'tmp-promise';
import { zip } from 'zip-a-folder';

import { MODULE_OPTIONS_TOKEN } from './emeth.definition';
import { EmethModuleOptions } from './emeth.interfaces';
import { EmethWalletService } from './emeth-wallet.service';

// each part is 5MiB
const UPLOAD_PART_SIZE = 5 * 1024 * 1024;

@Injectable()
export class EmethStorageService {
  private readonly storageApiUrl: string;

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) options: EmethModuleOptions,
    @Inject(EmethWalletService)
    private readonly walletService: EmethWalletService,
  ) {
    ({ storageApiUrl: this.storageApiUrl } = options);
  }

  async download(jobId: string, type: string, path: string): Promise<void> {
    const signature = await this.walletService.getWallet().signMessage(jobId);

    const downloadApiUrl = new URL('download', this.storageApiUrl);
    downloadApiUrl.searchParams.append('jobId', jobId);
    downloadApiUrl.searchParams.append('type', type);
    downloadApiUrl.searchParams.append('signature', signature);

    const downloadApiResponse = await fetch(downloadApiUrl);

    const downloadStream = (
      await fetch((await downloadApiResponse.json()).downloadUrl)
    ).body;

    await tmp.withFile(
      async (zipFile) => {
        const writer = fs.createWriteStream(zipFile.path);

        await stream.promises.finished(
          stream.Readable.fromWeb(downloadStream as any).pipe(writer),
        );

        const admZip = new AdmZip(zipFile.path);

        await new Promise<void>((resolve, reject) => {
          admZip.extractAllToAsync(path, false, false, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        });
      },
      { unsafeCleanup: true },
    );
  }

  async upload(jobId: string, type: string, path: string): Promise<string> {
    return await tmp.withFile(
      async (zipFile) => {
        await zip(path, zipFile.path);

        let fileHandle: fs.promises.FileHandle | null = null;
        try {
          const uploadPresignedUrlApiUrl = new URL(
            'upload/presigned-url',
            this.storageApiUrl,
          );

          const uploadPresignedUrlApiResponse = await fetch(
            uploadPresignedUrlApiUrl,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: type,
                jobId: jobId,
                parts: Math.ceil(
                  fs.statSync(zipFile.path).size / UPLOAD_PART_SIZE,
                ),
              }),
            },
          );

          const {
            fileName,
            uploadId,
            preSignedUrls,
          }: {
            fileName: string;
            uploadId: string;
            preSignedUrls: { part: number; url: string }[];
          } = await uploadPresignedUrlApiResponse.json();

          fileHandle = await fs.promises.open(zipFile.path);

          const parts = [];
          const buffer = Buffer.alloc(UPLOAD_PART_SIZE);

          for (const preSignedUrl of preSignedUrls) {
            const { bytesRead } = await fileHandle.read(
              buffer,
              0,
              UPLOAD_PART_SIZE,
              (preSignedUrl.part - 1) * UPLOAD_PART_SIZE,
            );

            const uploadPartResponse = await fetch(preSignedUrl.url, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/octet-stream',
              },
              body: buffer.subarray(0, bytesRead),
            });

            parts.push({
              ETag: uploadPartResponse.headers.get('ETag').replaceAll('"', ''),
              PartNumber: preSignedUrl.part,
            });
          }

          const uploadCompleteApiUrl = new URL(
            'upload/complete',
            this.storageApiUrl,
          );

          await fetch(uploadCompleteApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: fileName,
              uploadId: uploadId,
              parts: parts,
            }),
          });

          return fileName;
        } finally {
          await fileHandle?.close();
        }
      },
      { unsafeCleanup: true },
    );
  }
}
