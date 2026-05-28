import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DiscoveryService } from './discovery/discovery.service';
import { SubPortalDispatcherService } from './discovery/sub-portal-dispatcher.service';

@Injectable()
export class AppService {
  private readonly portalServiceTokens = [
    'BiMedienService',
    'EvergabeDeService',
    'FbhhHamburgService',
    'DtvpService',
    'DeutscheEvergabeService',
    'HamburgWasserService',
    'VergabekooperationBerlinService',
    'SachsenEvergabeService',
    'ChariteBerlinService',
    'UdbudDkService',
    'PlacspEsService',
  ] as const;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly dispatcher: SubPortalDispatcherService,
    private readonly moduleRef: ModuleRef,
    @InjectPinoLogger(AppService.name)
    private readonly logger: PinoLogger,
  ) {}

  private async runPortalListingAndDocumentCycles(): Promise<void> {
    for (const token of this.portalServiceTokens) {
      const service = this.moduleRef.get<any>(token, { strict: false });
      if (!service) {
        this.logger.warn({ token }, 'Portal service token not found in container; skipping');
        continue;
      }

      if (typeof service.runListingCron === 'function') {
        try {
          await service.runListingCron();
        } catch (error: any) {
          this.logger.error({ token, error: error.message }, 'Portal listing cron execution failed during run-once cycle');
        }
      }

      if (typeof service.runDocumentCron === 'function') {
        try {
          await service.runDocumentCron();
        } catch (error: any) {
          this.logger.error({ token, error: error.message }, 'Portal document cron execution failed during run-once cycle');
        }
      }
    }
  }

  async triggerScrapeCycle(): Promise<{ status: string; message: string; discoveredCount: number }> {
    this.logger.info('Manual trigger: Starting scraping cycle');

    // 1) Discovery from öffentlichevergabe.de + immediate dispatch per tender
    const tenders = await this.discoveryService.discoverAll();
    let dispatched = 0;

    for (const tender of tenders) {
      await this.dispatcher.dispatch(tender);
      dispatched++;
    }

    // 2) Force a full portal sweep (listing + docs) so run-once matches expected behavior
    //    and we do not leave non-DTVP/non-deutsche portals with only procurement.json files.
    await this.runPortalListingAndDocumentCycles();

    this.logger.info(
      { discoveredCount: tenders.length, dispatchedCount: dispatched },
      'Manual trigger: Scraping cycle complete',
    );

    return {
      status: 'success',
      message: `Scraping cycle executed successfully. Discovery processed ${tenders.length} tenders and all portal listing/document cycles were executed.`,
      discoveredCount: tenders.length,
    };
  }
}
