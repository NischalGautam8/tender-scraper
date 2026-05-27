import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DtvpService } from './dtvp.service';

@Injectable()
export class DtvpCron {
  constructor(private readonly service: DtvpService) {}

  @Cron('20 2 * * *') // 02:20 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('15 4 * * *') // 04:15 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
