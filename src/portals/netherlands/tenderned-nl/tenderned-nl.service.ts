import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CreateProcurementInput, TenderStatus } from '../../../schema/procurement.types';
import * as path from 'path';

@Injectable()
export class TendernedNlService extends BaseScraperService {
  readonly portalName = 'tenderned-nl';
  readonly locale = 'nl';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(TendernedNlService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info('Fetching recent listings from TenderNed API');
    const listings: any[] = [];
    
    // We fetch page 0 and page 1 to get the 100 most recent tenders.
    for (let page = 0; page < 2; page++) {
      const url = `https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties?page=${page}&size=50`;
      try {
        const responseText = await this.httpClient.getText(url, {
          timeout: 20000,
          headers: {
            'Accept': 'application/json',
          }
        });
        const response = JSON.parse(responseText);
        const items = response?.content || [];
        
        for (const item of items) {
          if (item.publicatiestatus?.code !== 'PUB') {
            continue;
          }
          listings.push(item);
        }
        
        // Rate limit: 1.5 seconds between listing page fetches
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch (error: any) {
        this.logger.error({ url, error: error.message }, 'Failed to fetch TenderNed listing page');
      }
    }
    
    this.logger.info({ count: listings.length }, 'Fetched TenderNed listings. Now fetching detail data for each...');
    
    const details: any[] = [];
    for (const listing of listings) {
      const detailUrl = `https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/${listing.publicatieId}`;
      try {
        const detailText = await this.httpClient.getText(detailUrl, {
          timeout: 15000,
          headers: {
            'Accept': 'application/json',
          }
        });
        const detail = JSON.parse(detailText);
        details.push({
          ...listing,
          ...detail,
          id: String(listing.publicatieId),
        });
        
        // Rate limit: 1 second delay between detail fetches
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        this.logger.warn({ detailUrl, error: error.message }, 'Failed to fetch detail for TenderNed listing; falling back to listing data');
        details.push({
          ...listing,
          id: String(listing.publicatieId),
        });
      }
    }
    
    return details;
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    const publicatieId = String(raw.publicatieId);
    const portalUrl = raw.link?.href || `https://www.tenderned.nl/aankondigingen/overzicht/${publicatieId}`;
    const kenmerk = raw.kenmerk ? String(raw.kenmerk) : null;

    // Status mapping: AGO = Aankondiging gegunde opdracht (Awarded), AAO = Aankondiging opdracht (Open)
    let status: TenderStatus = 'OPEN';
    const rawStatus = (raw.typePublicatie?.code || raw.aankondigingCode?.code || '').toUpperCase();
    if (rawStatus === 'AGO') {
      status = 'AWARDED';
    }

    // Procurement type mapping: D = Diensten (Services), L = Leveringen (Supplies), W = Werken (Works)
    let procurementType = 'SERVICES';
    const rawType = (raw.typeOpdracht?.code || raw.typeOpdrachtCode?.code || '').toUpperCase();
    if (rawType === 'L') {
      procurementType = 'SUPPLIES';
    } else if (rawType === 'W') {
      procurementType = 'WORKS';
    }

    // Procedure mapping
    let procedureType = 'OPEN';
    const rawProcedure = (raw.procedure?.code || raw.procedureCode?.code || '').toUpperCase();
    if (rawProcedure === 'NOP') {
      procedureType = 'RESTRICTED';
    } else if (rawProcedure === 'OMB') {
      procedureType = 'NEGOTIATED';
    }

    // CPV Codes mapping
    const cpvCodeArray = Array.isArray(raw.cpvCodes)
      ? raw.cpvCodes.map((c: any) => c.code).filter(Boolean)
      : [];

    // NUTS Codes mapping
    const nutsCodes = Array.isArray(raw.nutsCodes)
      ? raw.nutsCodes.map((n: any) => n.code).filter(Boolean)
      : [];

    // Format deadline date to standard ISO string or null
    let deadline: string | null = null;
    if (raw.sluitingsDatum) {
      try {
        deadline = new Date(raw.sluitingsDatum).toISOString();
      } catch {
        deadline = null;
      }
    }

    const title = raw.aanbestedingNaam || 'Untitled Tender';
    const description = raw.opdrachtBeschrijving || title;

    return {
      sourceArray: [
        {
          __type: 'TendernedNlSource',
          publicatieId,
          kenmerk,
          portalUrl,
        },
      ],
      tender: {
        status,
        title: { nl: title },
        shortDescription: { nl: description },
        longDescription: { nl: description },
        procurementType,
        procedureType,
        estimatedValue: null,
        cpvCodeArray,
        languageCodeArray: ['nl'],
        documentsUrl: portalUrl,
        portalUrl,
        submissionUrl: null,
        canBidOnIndividualLots: null,
        variantTendersAllowed: null,
        isFrameworkAgreement: null,
        biddingConsortiumAllowed: null,
        subcontractingPolicy: null,
        awardCriteriaArray: [],
        submissionDetails: {
          deadlineReceiptTenders: deadline,
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['nl'],
          electronicSubmissionRequired: raw.isDigitaalInschrijvenMogelijk ?? null,
          electronicSubmissionUrl: raw.isDigitaalInschrijvenMogelijk ? portalUrl : null,
          tenderValidityDays: null,
          openingDate: null,
          openingPlace: null,
          openingDescription: null,
        },
        reviewInformation: {
          bodyName: 'Rechtbank',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: raw.opdrachtgeverNaam || 'Unknown Contracting Body',
          nationalRegistrationNumber: null,
          location: {
            description: 'Nederland',
            address: {
              streetAddress: null,
              city: null,
              postalCode: null,
              country: 'Nederland',
            },
            nutsCodes,
          },
          contact: {
            contactPoint: null,
            email: null,
            telephone: null,
            url: portalUrl,
          },
          organisationType: null,
          mainActivity: null,
          isMain: true,
        },
      ],
    };
  }

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading attachments from TenderNed');
    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir);
  }
}
