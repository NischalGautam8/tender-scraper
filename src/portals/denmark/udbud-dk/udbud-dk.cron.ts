import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UdbudDkService } from './udbud-dk.service';

@Injectable()
export class UdbudDkCron {
  constructor(private readonly service: UdbudDkService) {}

  @Cron('0 3 * * *') // 03:00 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('0 5 * * *') // 05:00 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
