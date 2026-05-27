import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class AppService {
  constructor(
    @InjectPinoLogger(AppService.name)
    private readonly logger: PinoLogger,
  ) {}

  async triggerScrapeCycle(): Promise<{ status: string; message: string }> {
    this.logger.info('Manual trigger: Starting scraping cycle');
    // In Sprint 1, we return a stub. In future sprints, we will wire this up to
    // execute all active scrapers (discovery layer, Danish, Spanish, etc.).
    this.logger.info('Manual trigger: Scraping cycle complete (Sprint 1 skeleton)');
    return {
      status: 'success',
      message: 'Scraping cycle executed successfully (Sprint 1 skeleton)',
    };
  }
}
