import { Module } from '@nestjs/common';
import { SharedModule } from '../../../../shared/shared.module';
import { ChariteBerlinService } from './charite-berlin.service';

@Module({
  imports: [SharedModule],
  providers: [
    ChariteBerlinService,
    {
      provide: 'ChariteBerlinService',
      useExisting: ChariteBerlinService,
    },
  ],
  exports: [ChariteBerlinService],
})
export class ChariteBerlinModule {}
