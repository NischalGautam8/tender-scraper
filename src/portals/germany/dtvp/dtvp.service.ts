import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';

@Injectable()
export class DtvpService extends BaseScraperService {
  readonly portalName = 'dtvp';
  readonly locale = 'de';

  private readonly searchUrl = 'https://www.dtvp.de/Center/notice/CXP4Y0S';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(DtvpService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info({ searchUrl: this.searchUrl }, 'Fetching listings from dtvp.de (production)');

    try {
      // DTVP uses the Subreport/Cosinex platform; try the search page
      const html = await this.httpClient.getText('https://www.dtvp.de/Center/', {
        timeout: 15000,
        maxRetries: 2,
      });

      const $ = cheerio.load(html);
      const listings: any[] = [];

      $('a[href*="/Center/notice/"], a[href*="TenderingProcedureDetails"]').each((_i, el) => {
        const href = $(el).attr('href') || '';
        if (!href) return;

        const absoluteUrl = href.startsWith('http')
          ? href
          : `https://www.dtvp.de${href}`;

        const pathParts = absoluteUrl.split('/').filter(Boolean);
        const id = pathParts[pathParts.length - 1] || `dtvp-${_i}`;

        const title = $(el).text().trim();
        if (!title || title.length < 5) return;

        const parent = $(el).closest('div, li, tr, article');
        const description = parent.find('p, .description, td:nth-child(2)').first().text().trim();

        listings.push({
          id,
          title,
          shortDescription: description || title,
          documentsUrl: absoluteUrl,
          portalUrl: absoluteUrl,
          estimatedValue: null,
        });
      });

      this.logger.info({ listingsCount: listings.length }, 'Parsed dtvp.de listings');
      return listings;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch/parse dtvp.de listings');
      return [];
    }
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'DtvpSource',
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
        cpvCodeArray: [],
        languageCodeArray: ['de'],
        documentsUrl: raw.documentsUrl,
        portalUrl: raw.portalUrl,
        submissionUrl: raw.portalUrl,
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
          officialName: 'Unknown (parsed from DTVP)',
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
          organisationType: 'BODY_PUBLIC_LAW',
          mainActivity: 'GENERAL_PUBLIC_SERVICES',
          isMain: true,
        },
      ],
    };
  }

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading documents from DTVP (production)');

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }

  override async processDiscoveredTender(tender: any): Promise<void> {
    // 1. Standard mapping, validation, writing procurement.json, and documents downloading
    await super.processDiscoveredTender(tender);

    // 2. Self-registration detection and writing alerts.json
    try {
      const alert = {
        type: 'REGISTRATION_REQUIRED',
        severity: 'HIGH',
        portal: 'dtvp',
        message: 'Buyer must self-register on the Interessentenliste before the deadline to participate.',
        registrationUrl: tender.portalUrl || `https://www.dtvp.de/Center/notice/${tender.id}`,
        deadline: null, // Will be parsed from the real page in future iterations
        detectedAt: new Date().toISOString(),
      };
      
      await this.outputManager.writeAlert(this.portalName, tender.id, alert);
      this.logger.info(`Wrote registration warning alerts.json for DTVP tender=${tender.id}`);
    } catch (error: any) {
      this.logger.error({ tenderId: tender.id, error: error.message }, 'Failed to check self-registration / write alerts.json');
    }
  }
}
