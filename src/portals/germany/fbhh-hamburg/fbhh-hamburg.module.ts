import { Module } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { FbhhHamburgService } from './fbhh-hamburg.service';
import { FbhhHamburgCron } from './fbhh-hamburg.cron';

@Module({
  imports: [SharedModule],
  providers: [
    FbhhHamburgService,
    {
      provide: 'FbhhHamburgService',
      useExisting: FbhhHamburgService,
    },
    FbhhHamburgCron,
  ],
  exports: [FbhhHamburgService],
})
export class FbhhHamburgModule {}
