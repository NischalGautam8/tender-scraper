import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { DeutscheEvergabeService } from './deutsche-evergabe.service';
import { DeutscheEvergabeCron } from './deutsche-evergabe.cron';

@Module({
  imports: [SharedModule],
  providers: [
    DeutscheEvergabeService,
    {
      provide: 'DeutscheEvergabeService',
      useExisting: DeutscheEvergabeService,
    },
    DeutscheEvergabeCron,
  ],
  exports: [DeutscheEvergabeService],
})
export class DeutscheEvergabeModule {}
