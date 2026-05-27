import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { PlacspEsService } from './placsp-es.service';
import { WebSphereSessionService } from './websphere-session.service';
import { PlacspEsCron } from './placsp-es.cron';

@Module({
  imports: [SharedModule],
  providers: [
    PlacspEsService,
    {
      provide: 'PlacspEsService',
      useExisting: PlacspEsService,
    },
    WebSphereSessionService,
    PlacspEsCron,
  ],
  exports: [PlacspEsService],
})
export class PlacspEsModule {}
