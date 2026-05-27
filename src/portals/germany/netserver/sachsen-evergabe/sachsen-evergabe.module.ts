import { Module } from '@nestjs/common';
import { SharedModule } from '../../../../shared/shared.module';
import { SachsenEvergabeService } from './sachsen-evergabe.service';

@Module({
  imports: [SharedModule],
  providers: [
    SachsenEvergabeService,
    {
      provide: 'SachsenEvergabeService',
      useExisting: SachsenEvergabeService,
    },
  ],
  exports: [SachsenEvergabeService],
})
export class SachsenEvergabeModule {}
