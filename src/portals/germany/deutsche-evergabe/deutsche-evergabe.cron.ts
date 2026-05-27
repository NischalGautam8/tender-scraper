import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DeutscheEvergabeService } from './deutsche-evergabe.service';

@Injectable()
export class DeutscheEvergabeCron {
  constructor(private readonly service: DeutscheEvergabeService) {}

  @Cron('40 2 * * *') // 02:40 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('35 4 * * *') // 04:35 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
