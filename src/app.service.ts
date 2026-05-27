import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DiscoveryService } from './discovery/discovery.service';
import { SubPortalDispatcherService } from './discovery/sub-portal-dispatcher.service';

@Injectable()
export class AppService {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly dispatcher: SubPortalDispatcherService,
    @InjectPinoLogger(AppService.name)
    private readonly logger: PinoLogger,
  ) {}

  async triggerScrapeCycle(): Promise<{ status: string; message: string; discoveredCount: number }> {
    this.logger.info('Manual trigger: Starting scraping cycle');
    
    // 1. Run the discovery layer query
    const tenders = await this.discoveryService.discoverAll();
    
    // 2. Dispatch each discovered tender to its active sub-portal service
    let dispatched = 0;
    for (const tender of tenders) {
      await this.dispatcher.dispatch(tender);
      dispatched++;
    }
    
    this.logger.info(
      { discoveredCount: tenders.length, dispatchedCount: dispatched },
      'Manual trigger: Scraping cycle complete',
    );
    
    return {
      status: 'success',
      message: `Scraping cycle executed successfully. Discovered and processed ${tenders.length} tenders across active German sub-portals.`,
      discoveredCount: tenders.length,
    };
  }
}
