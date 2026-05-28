import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';

@Injectable()
export class BiMedienService extends BaseScraperService {
  readonly portalName = 'bi-medien';
  readonly locale = 'de';

  private readonly searchUrl = 'https://bi-medien.de/ausschreibungsdienste/';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(BiMedienService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info({ searchUrl: this.searchUrl }, 'Fetching listings from bi-medien.de (production)');

    try {
      const rootHtml = await this.httpClient.getText(this.searchUrl, {
        timeout: 15000,
        maxRetries: 2,
      });

      const $root = cheerio.load(rootHtml);

      // Only crawl concrete listing category pages. The root page contains many
      // navigation links that are not tenders and were previously creating fake folders.
      const categoryUrls = new Set<string>();
      $root('a[href*="/ausschreibungsdienste/ausschreibungen/"]').each((_i, el) => {
        const href = $root(el).attr('href') || '';
        if (!href) return;

        const absoluteUrl = href.startsWith('http')
          ? href
          : `https://bi-medien.de${href}`;

        // Keep first-level category pages such as:
        // /ausschreibungsdienste/ausschreibungen/bauleistungen
        // /ausschreibungsdienste/ausschreibungen/lieferleistungen
        // /ausschreibungsdienste/ausschreibungen/dienstleistungen
        // but skip region/filter/detail links here.
        const pathName = new URL(absoluteUrl).pathname;
        const categoryMatch = pathName.match(
          /^\/ausschreibungsdienste\/ausschreibungen\/(bauleistungen|lieferleistungen|dienstleistungen)\/?$/i,
        );
        if (categoryMatch) {
          categoryUrls.add(`https://bi-medien.de${pathName}`);
        }
      });

      if (categoryUrls.size === 0) {
        this.logger.warn('No bi-medien category pages found; returning no listings');
        return [];
      }

      const listings: any[] = [];
      const seenIds = new Set<string>();

      for (const categoryUrl of categoryUrls) {
        this.logger.info({ categoryUrl }, 'Crawling bi-medien category page');

        let html = '';
        try {
          html = await this.httpClient.getText(categoryUrl, {
            timeout: 15000,
            maxRetries: 2,
          });
        } catch (error: any) {
          this.logger.warn({ categoryUrl, error: error.message }, 'Failed to fetch bi-medien category page');
          continue;
        }

        const $ = cheerio.load(html);
        $('a[href*="/ausschreibungsdienste/ausschreibungen/"]').each((_i, el) => {
          const href = $(el).attr('href') || '';
          if (!href) return;

          const absoluteUrl = href.startsWith('http')
            ? href
            : `https://bi-medien.de${href}`;

          const pathName = new URL(absoluteUrl).pathname;

          // Real tender detail URLs on bi-medien are in the form:
          // /ausschreibungsdienste/ausschreibungen/A461716711
          const tenderMatch = pathName.match(/^\/ausschreibungsdienste\/ausschreibungen\/([A-Z]\d{6,})\/?$/i);
          if (!tenderMatch) {
            return;
          }

          const id = tenderMatch[1];
          if (seenIds.has(id)) return;
          seenIds.add(id);

          const title = $(el).text().trim();
          const parent = $(el).closest('div, li, article, tr');
          const description = parent.find('p, .description, .teaser, td:nth-child(2)').first().text().trim();

          listings.push({
            id,
            title: title || `Ausschreibung ${id}`,
            shortDescription: description || title || `Ausschreibung ${id}`,
            documentsUrl: absoluteUrl,
            portalUrl: absoluteUrl,
            estimatedValue: null,
          });
        });
      }

      this.logger.info({ listingsCount: listings.length }, 'Parsed bi-medien listings');
      return listings;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch/parse bi-medien listings page');
      return [];
    }
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'BiMedienSource',
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
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: ['45214100-1'],
        languageCodeArray: ['de'],
        documentsUrl: raw.documentsUrl,
        portalUrl: raw.portalUrl,
        submissionUrl: null,
        canBidOnIndividualLots: false,
        variantTendersAllowed: false,
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
          officialName: 'Unknown (parsed from bi-medien)',
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

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading documents from bi-medien.de (production)');

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }
}
