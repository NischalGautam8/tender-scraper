import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as fs from 'fs';
import * as path from 'path';
import { HttpClientService, RequestOptions } from './http-client.service';

export interface DocumentRef {
  url: string;
  filename?: string;    // Preferred filename from portal
  mimeType?: string;
}

export interface DownloadResult {
  downloaded: string[];  // Paths of successfully downloaded files
  failed: string[];      // URLs that failed after retries
  skipped: string[];     // Already existed on disk
}

@Injectable()
export class DocumentDownloaderService {
  constructor(
    private readonly httpClient: HttpClientService,
    @InjectPinoLogger(DocumentDownloaderService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Download a single file.
   * @returns path to the downloaded file, or null if failed
   */
  async downloadFile(
    url: string,
    destDir: string,
    preferredFilename?: string,
    options: RequestOptions = {},
  ): Promise<string | null> {
    try {
      // Create destDir if not exists
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Determine filename
      let filename = preferredFilename;
      if (!filename) {
        const parsedUrl = new URL(url);
        filename = path.basename(parsedUrl.pathname);
        if (!filename || filename === '/' || filename.trim() === '') {
          filename = `document_${Date.now()}`;
        }
      }

      // Sanitize filename to avoid folder traversal or illegal characters
      filename = filename.replace(/[/\\?%*:|"<>\s]/g, '_');

      let destPath = path.join(destDir, filename);
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      let counter = 1;

      while (fs.existsSync(destPath)) {
        destPath = path.join(destDir, `${base}-${counter}${ext}`);
        counter++;
      }

      this.logger.info({ url, destPath }, 'Downloading document');
      await this.httpClient.downloadStream(url, destPath, options);

      // Verify file integrity (non-zero bytes)
      if (fs.existsSync(destPath)) {
        const stats = fs.statSync(destPath);
        if (stats.size > 0) {
          this.logger.info({ destPath, sizeBytes: stats.size }, 'Successfully downloaded document');
          return destPath;
        } else {
          this.logger.warn({ destPath }, 'Downloaded file is 0 bytes; deleting and counting as failure');
          fs.unlinkSync(destPath);
        }
      }

      return null;
    } catch (error: any) {
      this.logger.error({ url, error: error.message }, 'Failed to download document');
      return null;
    }
  }

  /**
   * Download all documents for a tender.
   */
  async downloadAllDocuments(
    documents: DocumentRef[],
    tenderOutputDir: string,
    options: RequestOptions = {},
  ): Promise<DownloadResult> {
    const downloaded: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const doc of documents) {
      if (doc.filename) {
        const sanitizedFilename = doc.filename.replace(/[/\\?%*:|"<>\s]/g, '_');
        const expectedPath = path.join(tenderOutputDir, sanitizedFilename);
        if (fs.existsSync(expectedPath) && fs.statSync(expectedPath).size > 0) {
          this.logger.info({ filename: doc.filename }, 'File already exists with non-zero size; skipping download (idempotency)');
          skipped.push(expectedPath);
          continue;
        }
      }

      const filePath = await this.downloadFile(doc.url, tenderOutputDir, doc.filename, options);
      if (filePath) {
        downloaded.push(filePath);
      } else {
        failed.push(doc.url);
      }
    }

    return { downloaded, failed, skipped };
  }
}
