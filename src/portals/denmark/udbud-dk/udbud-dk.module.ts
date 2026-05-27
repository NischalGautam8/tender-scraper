import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { UdbudDkService } from './udbud-dk.service';
import { CloudflareBypassService } from './cloudflare-bypass.service';
import { UdbudDkCron } from './udbud-dk.cron';

@Module({
  imports: [SharedModule],
  providers: [
    UdbudDkService,
    {
      provide: 'UdbudDkService',
      useExisting: UdbudDkService,
    },
    CloudflareBypassService,
    UdbudDkCron,
  ],
  exports: [UdbudDkService],
})
export class UdbudDkModule {}
