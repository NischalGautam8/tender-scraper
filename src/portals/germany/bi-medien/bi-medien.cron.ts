import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BiMedienService } from './bi-medien.service';

@Injectable()
export class BiMedienCron {
  constructor(private readonly service: BiMedienService) {}

  @Cron('15 2 * * *') // 02:15 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('0 4 * * *') // 04:00 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
