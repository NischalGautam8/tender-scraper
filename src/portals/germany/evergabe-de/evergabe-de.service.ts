import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EvergabeDeService extends BaseScraperService {
  readonly portalName = 'evergabe-de';
  readonly locale = 'de';

  private readonly searchUrl = 'https://www.evergabe.de/auftraege';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(EvergabeDeService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info({ searchUrl: this.searchUrl }, 'Fetching listings from evergabe.de (production)');

    try {
      const html = await this.httpClient.getText(this.searchUrl, {
        timeout: 15000,
        maxRetries: 2,
      });

      const $ = cheerio.load(html);
      const listings: any[] = [];

      // evergabe.de renders tenders as list items or card elements linking to /ausschreibungen/
      $('a[href*="/ausschreibungen/"], a[href*="/unterlagen/"]').each((_i, el) => {
        const href = $(el).attr('href') || '';
        if (!href) return;

        const absoluteUrl = href.startsWith('http')
          ? href
          : `https://www.evergabe.de${href}`;

        // Extract ID from URL
        const pathParts = absoluteUrl.split('/').filter(Boolean);
        const id = pathParts.find(p => /^\d+$/.test(p) || p.startsWith('ev-')) || `evergabe-${_i}`;

        const title = $(el).text().trim();
        if (!title || title.length < 5) return;

        const parent = $(el).closest('div, li, article, tr');
        const description = parent.find('p, .description, .subtitle').first().text().trim();

        listings.push({
          id,
          title,
          shortDescription: description || title,
          documentsUrl: absoluteUrl.replace('/ausschreibungen/', '/unterlagen/'),
          portalUrl: absoluteUrl,
          estimatedValue: null,
        });
      });

      this.logger.info({ listingsCount: listings.length }, 'Parsed evergabe.de listings');
      return listings;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch/parse evergabe.de listings');
      return [];
    }
  }

  private normalizeEvergabeUrl(url: string): string {
    if (!url || !url.includes('evergabe.de')) return url;

    // Some OCDS exports contain doubly-encoded URL segments (%2520 => %20).
    // Decode conservatively (max 2 rounds) so we keep valid URLs but avoid over-decoding.
    let normalized = url.trim();
    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURI(normalized);
        if (decoded === normalized) break;
        normalized = decoded;
      } catch {
        break;
      }
    }
    return normalized;
  }

  /**
   * Resolve the best documents URL for an evergabe.de tender.
   *
   * The OCDS API sometimes provides URLs pointing to search listing pages
   * (/auftraege/suche-ueber-vergabestellen/...) instead of the actual
   * documents page (/unterlagen/...). This method tries multiple strategies
   * to find the correct /unterlagen/ URL:
   *
   * 1. Scan OCDS rawResponse.tender.documents[] for /unterlagen/ URLs
   * 2. Scan serialized raw response for escaped /unterlagen/ URLs
   * 3. Extract /unterlagen/ URLs from the tender description text
   * 4. Fall back to the original URL (normalized)
   */
  private resolveDocumentsUrl(raw: any): string {
    const originalUrl: string = this.normalizeEvergabeUrl(raw.documentsUrl || raw.portalUrl || '');

    // If the URL already points to /unterlagen/, it's fine
    if (originalUrl.includes('/unterlagen/')) {
      return originalUrl;
    }

    // Strategy 1: Scan OCDS rawResponse.tender.documents[] for /unterlagen/ URLs
    const rawDocs = raw.rawResponse?.tender?.documents;
    if (Array.isArray(rawDocs)) {
      for (const doc of rawDocs) {
        const url = doc?.url;
        if (typeof url === 'string' && url.includes('evergabe.de') && url.includes('/unterlagen/')) {
          const resolvedUrl = this.normalizeEvergabeUrl(url);
          this.logger.info(
            { originalUrl, resolvedUrl },
            'Resolved /unterlagen/ URL from OCDS documents array',
          );
          return resolvedUrl;
        }
      }
    }

    // Strategy 2: Scan serialized raw response for escaped/embedded /unterlagen/ links
    try {
      const serialized = JSON.stringify(raw.rawResponse ?? {});
      const unescaped = serialized.replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
      const embeddedMatch = unescaped.match(/https?:\/\/(?:www\.)?evergabe\.de\/unterlagen\/[^\s"'<>)]+/i);
      if (embeddedMatch) {
        const resolvedUrl = this.normalizeEvergabeUrl(embeddedMatch[0]);
        this.logger.info(
          { originalUrl, resolvedUrl },
          'Resolved /unterlagen/ URL from serialized rawResponse',
        );
        return resolvedUrl;
      }
    } catch {
      // ignore serialization issues and continue fallback strategy
    }

    // Strategy 3: Extract /unterlagen/ URLs from description text
    const description = raw.shortDescription || raw.rawResponse?.tender?.description || '';
    const unterlagenMatch = description.match(
      /https?:\/\/(?:www\.)?evergabe\.de\/unterlagen\/[^\s"<>)]+/i,
    );
    if (unterlagenMatch) {
      const resolvedUrl = this.normalizeEvergabeUrl(unterlagenMatch[0]);
      this.logger.info(
        { originalUrl, resolvedUrl },
        'Resolved /unterlagen/ URL from tender description text',
      );
      return resolvedUrl;
    }

    // Strategy 4: Fall back to original URL
    if (originalUrl.includes('/auftraege/')) {
      this.logger.warn(
        { originalUrl },
        'Could not resolve /unterlagen/ URL; documentsUrl points to a search/listing page which may not contain download links',
      );
    }

    return originalUrl;
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    const documentsUrl = this.resolveDocumentsUrl(raw);

    return {
      sourceArray: [
        {
          __type: 'EvergabeDeSource',
          tenderExternalId: raw.id,
          portalUrl: raw.portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { de: raw.title },
        shortDescription: { de: raw.shortDescription },
        longDescription: { de: raw.shortDescription },
        procurementType: 'WORKS',
        procedureType: 'RESTRICTED',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: [],
        languageCodeArray: ['de'],
        documentsUrl,
        portalUrl: raw.portalUrl,
        submissionUrl: null,
        canBidOnIndividualLots: false,
        variantTendersAllowed: true,
        isFrameworkAgreement: false,
        biddingConsortiumAllowed: true,
        subcontractingPolicy: null,
        awardCriteriaArray: [],
        submissionDetails: {
          deadlineReceiptTenders: null,
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['de'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: raw.portalUrl,
          tenderValidityDays: null,
          openingDate: null,
          openingPlace: null,
          openingDescription: null,
        },
        reviewInformation: {
          bodyName: null,
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Unknown (parsed from evergabe.de)',
          nationalRegistrationNumber: null,
          location: {
            description: 'Deutschland',
            address: {
              streetAddress: null,
              city: null,
              postalCode: null,
              country: 'Deutschland',
            },
            nutsCodes: [],
          },
          contact: {
            contactPoint: null,
            email: null,
            telephone: null,
            url: raw.portalUrl,
          },
          organisationType: 'REGIONAL_AUTHORITY',
          mainActivity: 'GENERAL_PUBLIC_SERVICES',
          isMain: true,
        },
      ],
    };
  }

  override async processDiscoveredTender(tender: any): Promise<void> {
    await super.processDiscoveredTender(tender);

    try {
      const docsDir = await this.outputManager.ensureDocumentsDir(this.portalName, tender.id);
      const existing = fs.readdirSync(docsDir).filter((name) => {
        const fullPath = path.join(docsDir, name);
        return fs.statSync(fullPath).isFile() && fs.statSync(fullPath).size > 0;
      });

      if (existing.length > 0) {
        return;
      }

      const fallbackResult = await this.saveEvergabeNoticeFallback(tender, docsDir);
      if (fallbackResult.downloaded.length > 0) {
        this.logger.info(
          { tenderId: tender.id, files: fallbackResult.downloaded },
          'evergabe.de: stored notice fallback file because no downloadable attachments were accessible',
        );
      }
    } catch (error: any) {
      this.logger.warn(
        { tenderId: tender.id, error: error.message },
        'evergabe.de: failed to write notice fallback after download attempts',
      );
    }
  }

  private async saveEvergabeNoticeFallback(tender: any, destDir: string): Promise<DownloadResult> {
    const downloaded: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    try {
      const release = tender?.rawResponse ?? {};
      const title = release?.tender?.title || tender?.title || 'evergabe notice';
      const description = release?.tender?.description || tender?.shortDescription || '';
      const sourceUrl = this.resolveDocumentsUrl(tender);

      const noticeTextPath = path.join(destDir, 'notice_de.txt');
      const noticeJsonPath = path.join(destDir, 'notice_raw.json');

      const noticeText = [
        `Titel: ${title}`,
        sourceUrl ? `Quelle: ${sourceUrl}` : '',
        '',
        description,
      ]
        .filter(Boolean)
        .join('\n');

      if (noticeText.trim()) {
        if (fs.existsSync(noticeTextPath) && fs.statSync(noticeTextPath).size > 0) {
          skipped.push(noticeTextPath);
        } else {
          fs.writeFileSync(noticeTextPath, noticeText, 'utf8');
          downloaded.push(noticeTextPath);
        }
      }

      const serialized = JSON.stringify(release, null, 2);
      if (serialized && serialized !== '{}') {
        if (fs.existsSync(noticeJsonPath) && fs.statSync(noticeJsonPath).size > 0) {
          skipped.push(noticeJsonPath);
        } else {
          fs.writeFileSync(noticeJsonPath, serialized, 'utf8');
          downloaded.push(noticeJsonPath);
        }
      }

      if (downloaded.length === 0 && skipped.length === 0) {
        failed.push(sourceUrl || tender?.documentsUrl || String(tender?.id || 'unknown'));
      }
    } catch (error: any) {
      this.logger.warn({ tenderId: tender?.id, error: error.message }, 'evergabe.de: failed to save notice fallback');
      failed.push(tender?.documentsUrl || String(tender?.id || 'unknown'));
    }

    return { downloaded, failed, skipped };
  }

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    const normalizedUrl = this.normalizeEvergabeUrl(documentsUrl);
    this.logger.info({ documentsUrl, normalizedUrl, destDir }, 'Downloading documents from evergabe.de (production)');

    return this.downloader.discoverAndDownloadFromPage(normalizedUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }
}
