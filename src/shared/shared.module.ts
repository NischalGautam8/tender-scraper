import { Module, Global } from '@nestjs/common';
import { HttpClientService } from './http-client.service';
import { DocumentDownloaderService } from './document-downloader.service';
import { OutputManagerService } from './output-manager.service';

@Global()
@Module({
  providers: [
    HttpClientService,
    DocumentDownloaderService,
    OutputManagerService,
  ],
  exports: [
    HttpClientService,
    DocumentDownloaderService,
    OutputManagerService,
  ],
})
export class SharedModule {}
