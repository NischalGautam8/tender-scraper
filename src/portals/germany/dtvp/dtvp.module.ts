import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { DtvpService } from './dtvp.service';
import { DtvpCron } from './dtvp.cron';

@Module({
  imports: [SharedModule],
  providers: [
    DtvpService,
    {
      provide: 'DtvpService',
      useExisting: DtvpService,
    },
    DtvpCron,
  ],
  exports: [DtvpService],
})
export class DtvpModule {}
