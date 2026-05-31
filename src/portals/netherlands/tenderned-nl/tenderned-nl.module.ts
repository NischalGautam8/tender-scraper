import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { TendernedNlService } from './tenderned-nl.service';
import { TendernedNlCron } from './tenderned-nl.cron';

@Module({
  imports: [SharedModule],
  providers: [
    TendernedNlService,
    {
      provide: 'TendernedNlService',
      useExisting: TendernedNlService,
    },
    TendernedNlCron,
  ],
  exports: [TendernedNlService],
})
export class TendernedNlModule {}
