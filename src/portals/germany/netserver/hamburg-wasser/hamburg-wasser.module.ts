import { Module } from '@nestjs/common';
import { SharedModule } from '../../../../shared/shared.module';
import { HamburgWasserService } from './hamburg-wasser.service';

@Module({
  imports: [SharedModule],
  providers: [
    HamburgWasserService,
    {
      provide: 'HamburgWasserService',
      useExisting: HamburgWasserService,
    },
  ],
  exports: [HamburgWasserService],
})
export class HamburgWasserModule {}
