import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { EvergabeDeService } from './evergabe-de.service';
import { EvergabeDeCron } from './evergabe-de.cron';

@Module({
  imports: [SharedModule],
  providers: [
    EvergabeDeService,
    {
      provide: 'EvergabeDeService',
      useExisting: EvergabeDeService,
    },
    EvergabeDeCron,
  ],
  exports: [EvergabeDeService],
})
export class EvergabeDeModule {}
