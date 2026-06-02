import { HttpClientService } from '../http-client.service';
import { DocumentDownloaderService, DocumentRef, DownloadResult } from '../document-downloader.service';
import { OutputManagerService } from '../output-manager.service';
import { PinoLogger } from 'nestjs-pino';
import { CreateProcurementInput } from '../../schema/procurement.types';
import { validateProcurement } from '../../schema/validation';
import * as path from 'path';

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

  /**
   * Extract direct document download URLs from the OCDS rawResponse.
   * The öV API returns release.tender.documents[] with direct URLs,
   * which is far more reliable than trying to scrape portal pages.
   */
  private extractOcdsDocumentRefs(tender: any): DocumentRef[] {
    const refs: DocumentRef[] = [];

    const shouldSkipOcdsDocUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const pathname = parsed.pathname.toLowerCase();

        // Guardrail: some sources embed large sets of non-procurement legal/media links
        // (e.g. CURIA multilingual press-release PDFs) that create noisy 404 downloads.
        if (host === 'curia.europa.eu' || host.endsWith('.curia.europa.eu')) {
          return true;
        }

        // Guardrail: evergabe.de portal page URLs are NOT direct file downloads.
        // They are HTML pages (/auftraege/, /unterlagen/, /zustellweg-auswaehlen)
        // that require Playwright/scraping and are handled by the portal-specific
        // downloadDocuments flow. Trying to download them as files causes 418 errors.
        if (host === 'evergabe.de' || host === 'www.evergabe.de') {
          if (
            pathname.includes('/auftraege/') ||
            pathname.includes('/unterlagen/') ||
            pathname.includes('/ausschreibungen/') ||
            pathname.includes('/zustellweg-auswaehlen')
          ) {
            return true;
          }
        }
      } catch {
        // ignore parse errors and let normal flow handle it
      }
      return false;
    };

    const rawDocs = tender?.rawResponse?.tender?.documents;
    if (!Array.isArray(rawDocs)) {
      return refs;
    }

    const seenUrls = new Set<string>();

    // Map common MIME types to file extensions for cases where the URL has no extension
    const mimeToExt: Record<string, string> = {
      'application/pdf': '.pdf',
      'application/zip': '.zip',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/xml': '.xml',
      'text/xml': '.xml',
      'text/csv': '.csv',
      'text/plain': '.txt',
      'application/rtf': '.rtf',
    };

    for (const doc of rawDocs) {
      const url = doc?.url;
      if (!url || typeof url !== 'string') continue;
      if (shouldSkipOcdsDocUrl(url)) continue;
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      // Infer file extension from URL path or MIME type
      let ext = '';
      try {
        const parsedUrl = new URL(url);
        let pathname = parsedUrl.pathname;
        // Strip session ID suffixes like ;jsessionid=...
        const semiIdx = pathname.indexOf(';');
        if (semiIdx !== -1) pathname = pathname.substring(0, semiIdx);
        ext = path.extname(pathname).toLowerCase();
      } catch { /* ignore parse errors */ }

      if (!ext && doc.format) {
        ext = mimeToExt[doc.format] || '';
      }

      // Build filename: use the OCDS title with the inferred extension
      let filename: string | undefined;
      if (doc.title && doc.title.trim()) {
        const title = doc.title.trim();
        const titleExt = path.extname(title).toLowerCase();
        // Append extension only if the title doesn't already have a valid one
        filename = titleExt ? title : (ext ? `${title}${ext}` : title);
      }

      refs.push({
        url,
        filename,
        mimeType: doc.format || undefined,
      });
    }

    return refs;
  }

  /** Handle tender dispatched from the discovery layer */
  async processDiscoveredTender(tender: any): Promise<void> {
    this.logger.info({ tenderId: tender.id }, `Processing discovered tender for portal=${this.portalName}`);
    try {
      const procurement = await this.mapToProcurement(tender);
      
      const errors = validateProcurement(procurement, this.locale);
      if (errors.length > 0) {
        this.logger.warn({ errors, tenderId: tender.id }, `Validation warnings for dispatched tender`);
      }

      await this.outputManager.writeProcurement(this.portalName, tender.id, procurement);
      this.logger.info(`Wrote procurement.json for discovered tender=${tender.id}`);

      // Auto-trigger documents download for this tender immediately during discovery
      const docsDir = await this.outputManager.ensureDocumentsDir(this.portalName, tender.id);

      // Strategy 1: Download documents directly from OCDS rawResponse metadata
      //   The öV API embeds direct download URLs in release.tender.documents[].url
      //   which is far more reliable than scraping JS-rendered portal pages.
      const ocdsRefs = this.extractOcdsDocumentRefs(tender);

      let downloadedAny = false;

      if (ocdsRefs.length > 0) {
        this.logger.info(
          { tenderId: tender.id, documentCount: ocdsRefs.length },
          'Found direct document URLs in OCDS rawResponse; downloading directly',
        );
        const result = await this.downloader.downloadAllDocuments(ocdsRefs, docsDir);
        this.logger.info(
          {
            tenderId: tender.id,
            downloaded: result.downloaded.length,
            failed: result.failed.length,
            skipped: result.skipped.length,
          },
          'OCDS direct document download complete',
        );
        if (result.downloaded.length > 0) {
          downloadedAny = true;
        }
      }

      // Strategy 2: Fall back to portal page scraping if OCDS had no docs,
      // or if all OCDS downloads failed (e.g. redirected to login walls),
      // or as a supplement to catch any docs not in the OCDS metadata.
      if (!downloadedAny && procurement.tender.documentsUrl) {
        this.logger.info(
          { tenderId: tender.id, documentsUrl: procurement.tender.documentsUrl },
          'No documents successfully downloaded from OCDS refs; falling back to portal page scraping',
        );
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
