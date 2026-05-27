import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { BiMedienService } from './bi-medien.service';
import { BiMedienCron } from './bi-medien.cron';

@Module({
  imports: [SharedModule],
  providers: [
    BiMedienService,
    {
      provide: 'BiMedienService',
      useExisting: BiMedienService,
    },
    BiMedienCron,
  ],
  exports: [BiMedienService],
})
export class BiMedienModule {}
