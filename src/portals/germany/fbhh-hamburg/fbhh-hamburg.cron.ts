import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FbhhHamburgService } from './fbhh-hamburg.service';

@Injectable()
export class FbhhHamburgCron {
  constructor(private readonly service: FbhhHamburgService) {}

  @Cron('30 2 * * *') // 02:30 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('20 4 * * *') // 04:20 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
