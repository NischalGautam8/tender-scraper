import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';

@Injectable()
export class FbhhHamburgService extends BaseScraperService {
  readonly portalName = 'fbhh-hamburg';
  readonly locale = 'de';

  private readonly searchUrl = 'https://fbhh-evergabe.web.hamburg.de/evergabe.bieter/api/external/subproject';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(FbhhHamburgService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info('Fetching listings from fbhh-hamburg (production)');

    try {
      // FBHH Hamburg exposes a public JSON API for open tenders
      const response = await this.httpClient.get<any>(this.searchUrl, {
        timeout: 15000,
        maxRetries: 2,
      });

      if (Array.isArray(response)) {
        const listings = response.map((item: any) => ({
          id: item.id || item.subprojectId || `fbhh-${Date.now()}`,
          title: item.name || item.title || 'Untitled',
          shortDescription: item.description || item.name || '',
          documentsUrl: `https://fbhh-evergabe.web.hamburg.de/evergabe.bieter/api/external/subproject/${item.id || item.subprojectId}/documents`,
          portalUrl: `https://fbhh-evergabe.web.hamburg.de/evergabe.bieter/eva/#/subproject/${item.id || item.subprojectId}`,
          estimatedValue: item.estimatedValue || null,
        }));

        this.logger.info({ listingsCount: listings.length }, 'Parsed FBHH Hamburg listings from API');
        return listings;
      }

      // Fallback: try HTML scraping if response is not JSON array
      this.logger.info('FBHH API did not return array; falling back to HTML scraping');
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'FBHH JSON API failed; falling back to HTML scraping');
    }

    // HTML fallback
    try {
      const html = await this.httpClient.getText(
        'https://fbhh-evergabe.web.hamburg.de/evergabe.bieter/eva/',
        { timeout: 15000, maxRetries: 1 },
      );

      const $ = cheerio.load(html);
      const listings: any[] = [];

      $('a[href*="subproject"]').each((_i, el) => {
        const href = $(el).attr('href') || '';
        const absoluteUrl = href.startsWith('http')
          ? href
          : `https://fbhh-evergabe.web.hamburg.de${href}`;

        const idMatch = href.match(/subproject\/([^/?&]+)/);
        const id = idMatch ? idMatch[1] : `fbhh-${_i}`;

        const title = $(el).text().trim();
        if (!title || title.length < 5) return;

        listings.push({
          id,
          title,
          shortDescription: title,
          documentsUrl: absoluteUrl,
          portalUrl: absoluteUrl,
          estimatedValue: null,
        });
      });

      this.logger.info({ listingsCount: listings.length }, 'Parsed FBHH Hamburg listings from HTML');
      return listings;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch/parse FBHH Hamburg listings');
      return [];
    }
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'FbhhHamburgSource',
          tenderExternalId: raw.id,
          portalUrl: raw.portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { de: raw.title },
        shortDescription: { de: raw.shortDescription },
        longDescription: { de: raw.shortDescription },
        procurementType: 'SERVICES',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: [],
        languageCodeArray: ['de'],
        documentsUrl: raw.documentsUrl,
        portalUrl: raw.portalUrl,
        submissionUrl: null,
        canBidOnIndividualLots: true,
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
          bodyName: 'Vergabekammer Hamburg',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Freie und Hansestadt Hamburg',
          nationalRegistrationNumber: null,
          location: {
            description: 'Hamburg, Deutschland',
            address: {
              streetAddress: null,
              city: 'Hamburg',
              postalCode: null,
              country: 'Deutschland',
            },
            nutsCodes: ['DE600'],
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
    this.logger.info({ documentsUrl, destDir }, 'Downloading documents from fbhh-hamburg (production)');

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }
}
