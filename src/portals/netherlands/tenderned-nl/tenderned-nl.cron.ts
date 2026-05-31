import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TendernedNlService } from './tenderned-nl.service';

@Injectable()
export class TendernedNlCron {
  constructor(private readonly service: TendernedNlService) {}

  @Cron('0 5 * * *') // 05:00 daily
  async handleListingCron() {
    await this.service.runListingCron();
  }

  @Cron('0 7 * * *') // 07:00 daily
  async handleDocumentCron() {
    await this.service.runDocumentCron();
  }
}
