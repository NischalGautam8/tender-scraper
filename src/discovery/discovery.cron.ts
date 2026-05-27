import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DiscoveryService } from './discovery.service';
import { SubPortalDispatcherService } from './sub-portal-dispatcher.service';

@Injectable()
export class DiscoveryCron {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly dispatcher: SubPortalDispatcherService,
    @InjectPinoLogger(DiscoveryCron.name)
    private readonly logger: PinoLogger,
  ) {}

  @Cron('0 2 * * *') // 02:00 daily
  async handleDiscovery() {
    this.logger.info('Discovery cron started');
    try {
      const tenders = await this.discoveryService.discoverAll();
      for (const tender of tenders) {
        await this.dispatcher.dispatch(tender);
      }
      this.logger.info({ tendersFound: tenders.length }, 'Discovery cron complete');
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Discovery cron failed with error');
    }
  }
}
