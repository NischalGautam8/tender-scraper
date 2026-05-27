import { Module } from '@nestjs/common';
import { SharedModule } from '../../../../shared/shared.module';
import { VergabekooperationBerlinService } from './vergabekooperation-berlin.service';

@Module({
  imports: [SharedModule],
  providers: [
    VergabekooperationBerlinService,
    {
      provide: 'VergabekooperationBerlinService',
      useExisting: VergabekooperationBerlinService,
    },
  ],
  exports: [VergabekooperationBerlinService],
})
export class VergabekooperationBerlinModule {}
