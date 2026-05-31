import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as fs from 'fs';
import * as path from 'path';
import { DiscoveryService } from './discovery/discovery.service';
import { SubPortalDispatcherService } from './discovery/sub-portal-dispatcher.service';

interface PortalRunner {
  token: string;
  portalName: string;
  service: {
    runListingCron?: () => Promise<any>;
    runDocumentCron?: () => Promise<any>;
  };
  originalIndex: number;
  missingDocsCount: number;
}

interface RunOptions {
  prioritizeMissingDocs: boolean;
  skipPortals: string[];
}

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
    'TendernedNlService',
  ] as const;

  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly dispatcher: SubPortalDispatcherService,
    private readonly moduleRef: ModuleRef,
    @InjectPinoLogger(AppService.name)
    private readonly logger: PinoLogger,
  ) {}

  private hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
  }

  private getArgValue(argName: string): string | undefined {
    const arg = process.argv.find((v) => v.startsWith(`${argName}=`));
    if (!arg) return undefined;
    return arg.split('=').slice(1).join('=').trim();
  }

  private parseCsvOption(argName: string): string[] {
    const raw = this.getArgValue(argName) ?? '';
    return raw
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }

  private getRunOptions(): RunOptions {
    return {
      prioritizeMissingDocs: this.hasFlag('--prioritize-missing-docs'),
      skipPortals: this.parseCsvOption('--skip-portals'),
    };
  }

  private countMissingDocumentsForPortal(portalName: string): number {
    const portalDir = path.join(process.cwd(), 'output', portalName);
    if (!fs.existsSync(portalDir) || !fs.statSync(portalDir).isDirectory()) {
      return 0;
    }

    let missingCount = 0;
    const tenderDirs = fs
      .readdirSync(portalDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const tenderId of tenderDirs) {
      const docsDir = path.join(portalDir, tenderId, 'documents');
      if (!fs.existsSync(docsDir) || !fs.statSync(docsDir).isDirectory()) {
        missingCount++;
        continue;
      }

      if (fs.readdirSync(docsDir).length === 0) {
        missingCount++;
      }
    }

    return missingCount;
  }

  private async runPortalListingAndDocumentCycles(options: RunOptions): Promise<void> {
    const runners: PortalRunner[] = [];

    for (const [originalIndex, token] of this.portalServiceTokens.entries()) {
      const service = this.moduleRef.get<any>(token, { strict: false });
      if (!service) {
        this.logger.warn({ token }, 'Portal service token not found in container; skipping');
        continue;
      }

      const portalName = String(service.portalName || token).toLowerCase();
      if (options.skipPortals.includes(portalName)) {
        this.logger.info({ portalName, token }, 'Skipping portal because it is in --skip-portals');
        continue;
      }

      runners.push({
        token,
        portalName,
        service,
        originalIndex,
        missingDocsCount: options.prioritizeMissingDocs
          ? this.countMissingDocumentsForPortal(portalName)
          : 0,
      });
    }

    const orderedRunners = [...runners].sort((a, b) => {
      if (options.prioritizeMissingDocs && a.missingDocsCount !== b.missingDocsCount) {
        return b.missingDocsCount - a.missingDocsCount;
      }
      return a.originalIndex - b.originalIndex;
    });

    this.logger.info(
      {
        options,
        executionOrder: orderedRunners.map((runner) => ({
          portal: runner.portalName,
          missingDocsCount: runner.missingDocsCount,
        })),
      },
      'Portal execution plan prepared',
    );

    for (const runner of orderedRunners) {
      const { token, service, portalName, missingDocsCount } = runner;

      if (typeof service.runListingCron === 'function') {
        try {
          await service.runListingCron();
        } catch (error: any) {
          this.logger.error(
            { token, portalName, missingDocsCount, error: error.message },
            'Portal listing cron execution failed during run-once cycle',
          );
        }
      }

      if (typeof service.runDocumentCron === 'function') {
        try {
          await service.runDocumentCron();
        } catch (error: any) {
          this.logger.error(
            { token, portalName, missingDocsCount, error: error.message },
            'Portal document cron execution failed during run-once cycle',
          );
        }
      }
    }
  }

  async triggerScrapeCycle(): Promise<{ status: string; message: string; discoveredCount: number }> {
    const options = this.getRunOptions();
    this.logger.info({ options }, 'Manual trigger: Starting scraping cycle');

    // 1) Discovery from öffentlichevergabe.de + immediate dispatch per tender
    const tenders = await this.discoveryService.discoverAll();
    let dispatched = 0;

    for (const tender of tenders) {
      const tenderPortal = String(tender?.subPortalModule || '').toLowerCase();
      if (tenderPortal && options.skipPortals.includes(tenderPortal)) {
        this.logger.info(
          { tenderId: tender.id, portal: tenderPortal },
          'Skipping discovered tender dispatch because portal is in --skip-portals',
        );
        continue;
      }

      await this.dispatcher.dispatch(tender);
      dispatched++;
    }

    // 2) Full portal sweep (listing + docs), prioritized by missing docs if requested
    await this.runPortalListingAndDocumentCycles(options);

    this.logger.info(
      { discoveredCount: tenders.length, dispatchedCount: dispatched, options },
      'Manual trigger: Scraping cycle complete',
    );

    return {
      status: 'success',
      message: `Scraping cycle executed successfully. Discovery processed ${tenders.length} tenders and portal listing/document cycles were executed.`,
      discoveredCount: tenders.length,
    };
  }
}
