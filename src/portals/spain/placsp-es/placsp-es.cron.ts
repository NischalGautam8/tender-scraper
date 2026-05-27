import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlacspEsService } from './placsp-es.service';

@Injectable()
export class PlacspEsCron {
  constructor(private readonly service: PlacspEsService) {}

  @Cron('30 3 * * *') // 03:30 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('30 5 * * *') // 05:30 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
