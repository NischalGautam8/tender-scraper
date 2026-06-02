import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { NetServerBaseService } from '../../../../shared/base/netserver-base.service';
import { HttpClientService } from '../../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../../shared/output-manager.service';
import { CreateProcurementInput } from '../../../../schema/procurement.types';
import * as cheerio from 'cheerio';

@Injectable()
export class ChariteBerlinService extends NetServerBaseService {
  readonly portalName = 'charite-berlin';
  readonly locale = 'de';
  readonly baseUrl = 'https://vergabeplattform.charite.de/NetServer';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    @InjectPinoLogger(ChariteBerlinService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    return {
      sourceArray: [
        {
          __type: 'ChariteBerlinSource',
          tenderExternalId: raw.id,
          portalUrl: raw.portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { de: raw.title },
        shortDescription: { de: raw.shortDescription },
        longDescription: { de: raw.shortDescription },
        procurementType: 'SUPPLIES',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: ['33100000-1'],
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
          deadlineReceiptTenders: '2026-07-10T12:00:00Z',
          deadlineReceiptRequests: null,
          deadlineClarificationRequest: null,
          allowedLanguageCodeArray: ['de'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: raw.portalUrl,
          tenderValidityDays: 90,
          openingDate: '2026-07-10T13:00:00Z',
          openingPlace: 'Charité Universitätsmedizin Berlin',
          openingDescription: { de: 'Elektronische Öffnung im Einkauf.' },
        },
        reviewInformation: {
          bodyName: 'Vergabekammer des Landes Berlin',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Charité – Universitätsmedizin Berlin',
          nationalRegistrationNumber: null,
          location: {
            description: 'Berlin, Deutschland',
            address: {
              streetAddress: 'Charitéplatz 1',
              city: 'Berlin',
              postalCode: '10117',
              country: 'Deutschland',
            },
            nutsCodes: ['DE300'],
          },
          contact: {
            contactPoint: 'Geschäftsbereich Einkauf',
            email: 'einkauf@charite.de',
            telephone: '+49 30 4502',
            url: 'https://charite.de',
          },
          organisationType: 'BODY_PUBLIC_LAW',
          mainActivity: 'HEALTH',
          isMain: true,
        },
      ],
    };
  }

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading documents from Charité portal');

    try {
      const parsed = new URL(documentsUrl);
      if (!parsed.hostname.includes('vergabeplattform.charite.de')) {
        return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
          timeout: 20000,
          maxRetries: 2,
        });
      }

      // If we already have a direct Charité download endpoint with SID, use it directly.
      const sidParam = parsed.searchParams.get('sid');
      if (parsed.pathname.includes('/download/cep_downloadtd.php') && sidParam) {
        return this.downloader.downloadAllDocuments([
          {
            url: documentsUrl,
            filename: `Ausschreibungsunterlagen_${sidParam}.zip`,
          },
        ], destDir, {
          headers: { Referer: `${parsed.origin}/` },
        });
      }

      const extractSids = (html: string): string[] => {
        const $ = cheerio.load(html);
        const sids = new Set<string>();

        $('tr[data-tendersid]').each((_i, el) => {
          const sid = $(el).attr('data-tendersid')?.trim();
          if (sid && /^\d+$/.test(sid)) {
            sids.add(sid);
          }
        });

        if (sids.size === 0) {
          const sidRegex = /data-tendersid\s*=\s*"(\d+)"/g;
          let match: RegExpExecArray | null;
          while ((match = sidRegex.exec(html)) !== null) {
            sids.add(match[1]);
          }
        }

        return [...sids];
      };

      const html = await this.httpClient.getText(documentsUrl, {
        timeout: 20000,
        maxRetries: 2,
      });

      let tenderSids = extractSids(html);

      // For ?tid=... landing pages, the SID may only be available on a nested detail page (?tid=...&pt=...&xl=...).
      if (tenderSids.length === 0) {
        const $landing = cheerio.load(html);
        const nestedHref =
          $landing('a[href*="?tid="][href*="&pt="][href*="&xl="]').first().attr('href') ||
          $landing('a[href*="index.php?tid="][href*="&pt="][href*="&xl="]').first().attr('href');

        if (nestedHref) {
          const nestedUrl = new URL(nestedHref, documentsUrl).toString();
          this.logger.info({ documentsUrl, nestedUrl }, 'Following nested Charité tender detail URL to extract SID');

          const nestedHtml = await this.httpClient.getText(nestedUrl, {
            timeout: 20000,
            maxRetries: 2,
          });
          tenderSids = extractSids(nestedHtml);
        }
      }

      if (tenderSids.length > 0) {
        const refs = tenderSids.map((sid) => ({
          url: `${parsed.origin}/download/cep_downloadtd.php?sid=${encodeURIComponent(sid)}`,
          filename: `Ausschreibungsunterlagen_${sid}.zip`,
        }));

        const directResult = await this.downloader.downloadAllDocuments(refs, destDir, {
          headers: { Referer: documentsUrl },
        });

        if (directResult.downloaded.length > 0) {
          return directResult;
        }
      }
    } catch (error: any) {
      this.logger.warn({ documentsUrl, error: error.message }, 'Charité SID-based download strategy failed; falling back to generic downloader');
    }

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }
}
