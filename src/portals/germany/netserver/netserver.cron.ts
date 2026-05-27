import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HamburgWasserService } from './hamburg-wasser/hamburg-wasser.service';
import { VergabekooperationBerlinService } from './vergabekooperation-berlin/vergabekooperation-berlin.service';
import { SachsenEvergabeService } from './sachsen-evergabe/sachsen-evergabe.service';
import { ChariteBerlinService } from './charite-berlin/charite-berlin.service';

@Injectable()
export class NetServerCron {
  constructor(
    private readonly hamburgWasser: HamburgWasserService,
    private readonly berlin: VergabekooperationBerlinService,
    private readonly sachsen: SachsenEvergabeService,
    private readonly charite: ChariteBerlinService,
  ) {}

  @Cron('35 2 * * *') // 02:35 daily
  async handleListingCron() {
    await this.hamburgWasser.runListingCron();
    await this.berlin.runListingCron();
    await this.sachsen.runListingCron();
    await this.charite.runListingCron();
  }

  @Cron('30 4 * * *') // 04:30 daily
  async handleDocumentCron() {
    await this.hamburgWasser.runDocumentCron();
    await this.berlin.runDocumentCron();
    await this.sachsen.runDocumentCron();
    await this.charite.runDocumentCron();
  }
}
