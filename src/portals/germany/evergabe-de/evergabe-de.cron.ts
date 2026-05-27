import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EvergabeDeService } from './evergabe-de.service';

@Injectable()
export class EvergabeDeCron {
  constructor(private readonly service: EvergabeDeService) {}

  @Cron('25 2 * * *') // 02:25 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('10 4 * * *') // 04:10 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
