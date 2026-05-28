import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CloudflareBypassService } from './cloudflare-bypass.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';

@Injectable()
export class UdbudDkService extends BaseScraperService {
  readonly portalName = 'udbud-dk';
  readonly locale = 'da';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    private readonly cloudflareBypass: CloudflareBypassService,
    @InjectPinoLogger(UdbudDkService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info('Fetching listings from Udbud.dk (production)');

    let cookies = '';
    try {
      cookies = await this.cloudflareBypass.getClearedCookies();
      this.logger.info({ cookiesLength: cookies.length }, 'Cloudflare bypass cookies acquired');
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'Cloudflare bypass failed; attempting direct request');
    }

    try {
      const html = await this.httpClient.getText('https://udbud.dk/', {
        timeout: 15000,
        maxRetries: 2,
        cookies,
      });

      const $ = cheerio.load(html);
      const listings: any[] = [];

      $('a[href*="/notice/"], a[href*="/notices/"]').each((_i, el) => {
        const href = $(el).attr('href') || '';
        if (!href) return;

        const absoluteUrl = href.startsWith('http')
          ? href
          : `https://udbud.dk${href}`;

        const pathParts = absoluteUrl.split('/').filter(Boolean);
        const id = pathParts[pathParts.length - 1] || `udbud-${_i}`;

        const title = $(el).text().trim();
        if (!title || title.length < 5) return;

        const parent = $(el).closest('div, li, tr, article');
        const description = parent.find('p, .description').first().text().trim();

        listings.push({
          id,
          title,
          shortDescription: description || title,
          documentsUrl: absoluteUrl,
          portalUrl: absoluteUrl,
          estimatedValue: null,
        });
      });

      this.logger.info({ listingsCount: listings.length }, 'Parsed Udbud.dk listings');
      return listings;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch/parse Udbud.dk listings');
      return [];
    }
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    const portalUrl = raw.portalUrl || `https://udbud.dk/notice/${raw.id || 'unknown'}`;
    return {
      sourceArray: [
        {
          __type: 'UdbudDkSource',
          noticeId: raw.id,
          portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { da: raw.title },
        shortDescription: { da: raw.shortDescription },
        longDescription: { da: raw.shortDescription },
        procurementType: 'SUPPLIES',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'DKK' }
          : null,
        cpvCodeArray: [],
        languageCodeArray: ['da'],
        documentsUrl: raw.documentsUrl,
        portalUrl,
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
          allowedLanguageCodeArray: ['da'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: portalUrl,
          tenderValidityDays: null,
          openingDate: null,
          openingPlace: null,
          openingDescription: null,
        },
        reviewInformation: {
          bodyName: 'Klagenævnet for Udbud',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Unknown (parsed from Udbud.dk)',
          nationalRegistrationNumber: null,
          location: {
            description: 'Danmark',
            address: {
              streetAddress: null,
              city: null,
              postalCode: null,
              country: 'Danmark',
            },
            nutsCodes: [],
          },
          contact: {
            contactPoint: null,
            email: null,
            telephone: null,
            url: portalUrl,
          },
          organisationType: 'REGIONAL_AUTHORITY',
          mainActivity: 'GENERAL_PUBLIC_SERVICES',
          isMain: true,
        },
      ],
    };
  }

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading attachments from Udbud.dk (production)');

    let cookies = '';
    try {
      cookies = await this.cloudflareBypass.getClearedCookies();
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'Could not acquire Cloudflare cookies for download');
    }

    // Udbud detail pages are SPA shells. Real notice content is loaded from
    // /soegning/visning/<noticeId>/<version>. Extract external tender/doc links
    // from that payload first, then try downloading from those links.
    const candidateLinks = await this.fetchUdbudDocumentCandidates(documentsUrl, cookies);
    if (candidateLinks.length > 0) {
      this.logger.info({ documentsUrl, candidateCount: candidateLinks.length }, 'Udbud.dk: trying extracted external document candidates');
      const aggregate: DownloadResult = { downloaded: [], failed: [], skipped: [] };

      for (const link of candidateLinks.slice(0, 8)) {
        try {
          const result = await this.downloader.discoverAndDownloadFromPage(link, destDir, {
            timeout: 25000,
            maxRetries: 2,
            cookies,
          });
          aggregate.downloaded.push(...result.downloaded);
          aggregate.failed.push(...result.failed);
          aggregate.skipped.push(...result.skipped);
        } catch (error: any) {
          this.logger.warn({ link, error: error.message }, 'Udbud.dk: failed to process extracted candidate link');
          aggregate.failed.push(link);
        }
      }

      if (aggregate.downloaded.length > 0) {
        return aggregate;
      }
    }

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
      cookies,
    });
  }

  private async fetchUdbudDocumentCandidates(documentsUrl: string, cookies: string): Promise<string[]> {
    try {
      const parsed = new URL(documentsUrl);
      const noticeId = parsed.searchParams.get('noticeId');
      const noticeVersion = parsed.searchParams.get('noticeVersion') || '01';
      const noticePublicationNumber = parsed.searchParams.get('noticePublicationNumber') || '';
      if (!noticeId) return [];

      const visningUrl = `https://udbud.dk/soegning/visning/${encodeURIComponent(noticeId)}/${encodeURIComponent(noticeVersion)}${noticePublicationNumber ? `?noticePublicationNumber=${encodeURIComponent(noticePublicationNumber)}` : ''}`;

      const payload = await this.httpClient.get<any>(visningUrl, {
        timeout: 20000,
        maxRetries: 2,
        cookies,
      });

      const htmlDa = typeof payload?.htmlDA === 'string' ? payload.htmlDA : '';
      const htmlEn = typeof payload?.htmlEN === 'string' ? payload.htmlEN : '';
      const combined = `${htmlDa}\n${htmlEn}`;

      const urlMatches = combined.match(/https?:\/\/[^\s"'<>]+/g) || [];
      const cleaned = Array.from(new Set(urlMatches.map((u) => u.trim().replace(/[).,;]+$/, ''))));

      return cleaned.filter((url) => {
        const lower = url.toLowerCase();
        // Exclude schema/docs boilerplate links and focus on likely tender/doc portals.
        if (lower.includes('w3.org') || lower.includes('data.europa.eu') || lower.includes('kfst.dk') || lower.includes('naevneneshus.dk')) {
          return false;
        }
        return (
          lower.includes('mercell') ||
          lower.includes('eu-supply') ||
          lower.includes('comdia') ||
          lower.includes('ethics') ||
          lower.includes('ajoursystem') ||
          lower.includes('dalux') ||
          lower.includes('ibinder') ||
          lower.includes('publicmaterial') ||
          /\.pdf($|\?)/i.test(lower) ||
          /\.zip($|\?)/i.test(lower)
        );
      });
    } catch (error: any) {
      this.logger.warn({ documentsUrl, error: error.message }, 'Udbud.dk: failed to extract visning API document candidates');
      return [];
    }
  }
}
