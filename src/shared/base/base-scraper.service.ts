import { HttpClientService } from '../http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../document-downloader.service';
import { OutputManagerService } from '../output-manager.service';
import { PinoLogger } from 'nestjs-pino';
import { CreateProcurementInput } from '../../schema/procurement.types';
import { validateProcurement } from '../../schema/validation';

export interface ListingCronResult {
  tendersFound: number;
}

export interface DocumentCronResult {
  totalDownloaded: number;
  totalFailed: number;
}

/**
 * Abstract base class for all portal scrapers.
 * Enforces the two-cron pattern and provides template methods.
 */
export abstract class BaseScraperService {
  abstract readonly portalName: string;
  abstract readonly locale: string;        // e.g. 'de', 'da', 'es'

  constructor(
    protected readonly httpClient: HttpClientService,
    protected readonly downloader: DocumentDownloaderService,
    protected readonly outputManager: OutputManagerService,
    protected readonly logger: PinoLogger,
  ) {}

  /** Listing cron entry point */
  async runListingCron(): Promise<ListingCronResult> {
    this.logger.info(`Listing cron started for portal=${this.portalName}`);
    const tenders = await this.fetchListings();
    
    for (const tender of tenders) {
      try {
        const procurement = await this.mapToProcurement(tender);
        
        // Validate before writing
        const errors = validateProcurement(procurement, this.locale);
        if (errors.length > 0) {
          this.logger.warn({ errors, tenderId: tender.id }, 'Validation errors in mapped procurement');
        }
        
        await this.outputManager.writeProcurement(this.portalName, tender.id, procurement);
        this.logger.info(`Wrote procurement.json for tender=${tender.id}`);
      } catch (error: any) {
        this.logger.error({ tenderId: tender.id, error: error.message }, 'Failed to process tender listing');
      }
    }
    
    this.logger.info({ tendersFound: tenders.length }, `Listing cron complete for portal=${this.portalName}`);
    return { tendersFound: tenders.length };
  }

  /** Document cron entry point */
  async runDocumentCron(): Promise<DocumentCronResult> {
    this.logger.info(`Document cron started for portal=${this.portalName}`);
    const tenderIds = await this.outputManager.listTenderIds(this.portalName);
    let totalDownloaded = 0;
    let totalFailed = 0;

    for (const tenderId of tenderIds) {
      try {
        const procurement = await this.outputManager.readProcurement(this.portalName, tenderId);
        if (!procurement?.tender.documentsUrl) continue;

        const docsDir = await this.outputManager.ensureDocumentsDir(this.portalName, tenderId);
        const result = await this.downloadDocuments(procurement.tender.documentsUrl, docsDir);
        
        totalDownloaded += result.downloaded.length;
        totalFailed += result.failed.length;
      } catch (error: any) {
        this.logger.error({ tenderId, error: error.message }, 'Failed to download documents for tender');
      }
    }

    this.logger.info(
      { totalDownloaded, totalFailed },
      `Document cron complete for portal=${this.portalName}`,
    );
    return { totalDownloaded, totalFailed };
  }

  /** Handle tender dispatched from the discovery layer */
  async processDiscoveredTender(tender: any): Promise<void> {
    this.logger.info({ tenderId: tender.id }, `Processing discovered tender for portal=${this.portalName}`);
    try {
      const procurement = await this.mapToProcurement(tender.rawResponse || tender);
      
      const errors = validateProcurement(procurement, this.locale);
      if (errors.length > 0) {
        this.logger.warn({ errors, tenderId: tender.id }, `Validation warnings for dispatched tender`);
      }

      await this.outputManager.writeProcurement(this.portalName, tender.id, procurement);
      this.logger.info(`Wrote procurement.json for discovered tender=${tender.id}`);

      // Auto-trigger documents download for this tender immediately during discovery
      if (procurement.tender.documentsUrl) {
        const docsDir = await this.outputManager.ensureDocumentsDir(this.portalName, tender.id);
        await this.downloadDocuments(procurement.tender.documentsUrl, docsDir);
      }
    } catch (error: any) {
      this.logger.error({ tenderId: tender.id, error: error.message }, `Failed to process dispatched tender`);
    }
  }

  /** Portal-specific: fetch all tender listings (with pagination) */
  protected abstract fetchListings(): Promise<any[]>;

  /** Portal-specific: map raw portal data → CreateProcurementInput */
  protected abstract mapToProcurement(raw: any): Promise<CreateProcurementInput>;

  /** Portal-specific: download all documents for a tender */
  protected abstract downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult>;
}
