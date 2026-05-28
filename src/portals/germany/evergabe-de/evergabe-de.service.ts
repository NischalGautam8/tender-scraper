import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';

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
          documentsUrl: absoluteUrl.replace('/ausschreibungen/', '/unterlagen/').replace(/\/zustellweg-auswaehlen\/?$/i, ''),
          portalUrl: absoluteUrl.replace(/\/zustellweg-auswaehlen\/?$/i, ''),
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

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
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
        documentsUrl: raw.documentsUrl,
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

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading documents from evergabe.de (production)');

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }
}
