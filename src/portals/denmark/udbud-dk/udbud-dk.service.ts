import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { CloudflareBypassService } from './cloudflare-bypass.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as fs from 'fs';
import * as path from 'path';

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
    this.logger.info('Fetching listings from Udbud.dk (production) via POST API');

    let cookies = '';
    try {
      cookies = await this.cloudflareBypass.getClearedCookies();
      this.logger.info({ cookiesLength: cookies.length }, 'Cloudflare bypass cookies acquired');
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'Cloudflare bypass failed; attempting direct request');
    }

    const apiUrl = 'https://udbud.dk/soegning/public/soegeresultat';
    const payload = {
      pagineringDto: {
        aktuelSide: 1,
        maksElementer: 25,
        sorteringFelt: 'PUBLIKATION_DATO',
        retning: 'Desc'
      },
      filterDto: {
        formularType: ['NATIONALE_UDBUD', 'EU_UDBUD'],
        opgaveType: [],
        procedureType: [],
        smvVenligType: []
      },
      udbudStatusFilter: 'AKTIV'
    };

    try {
      const response = await this.httpClient.post<any>(apiUrl, payload, {
        timeout: 20000,
        maxRetries: 2,
        cookies,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://udbud.dk/soeg?aktuelSide=1&maksElementer=25&sorteringFelt=PUBLIKATION_DATO&sorteringRetning=Desc&formularType=NATIONALE_UDBUD&formularType=EU_UDBUD'
        }
      });

      const listings: any[] = [];
      const items = response?.resultatElementDtoList || [];

      for (const item of items) {
        const id = item.noticeId;
        if (!id) continue;

        const dataDa = item.dataDa || {};
        const title = dataDa.titel || item.dataEn?.titel || 'Untitled Notice';
        const description = dataDa.beskrivelse || item.dataEn?.beskrivelse || title;

        const version = item.noticeVersion || '01';
        const pubNum = item.noticePublicationNumber || '';
        const documentsUrl = `https://udbud.dk/detaljevisning?noticeId=${encodeURIComponent(id)}&noticeVersion=${encodeURIComponent(version)}${pubNum ? `&noticePublicationNumber=${encodeURIComponent(pubNum)}` : ''}`;

        let estimatedValue = null;
        if (dataDa.anslaaetVaerdi) {
          const val = parseFloat(dataDa.anslaaetVaerdi);
          if (!isNaN(val)) {
            estimatedValue = val;
          }
        }

        listings.push({
          id,
          title,
          shortDescription: description,
          documentsUrl,
          portalUrl: documentsUrl,
          estimatedValue,
        });
      }

      this.logger.info({ listingsCount: listings.length }, 'Parsed Udbud.dk API listings');
      return listings;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch/parse Udbud.dk listings from API');
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

    const aggregate: DownloadResult = { downloaded: [], failed: [], skipped: [] };

    // Udbud detail pages are SPA shells. Real notice content is loaded from
    // /soegning/visning/<noticeId>/<version>. Extract external tender/doc links
    // from that payload first, then try downloading from those links.
    const candidateLinks = await this.fetchUdbudDocumentCandidates(documentsUrl, cookies);
    if (candidateLinks.length > 0) {
      this.logger.info(
        { documentsUrl, candidateCount: candidateLinks.length, candidates: candidateLinks.slice(0, 5) },
        'Udbud.dk: trying extracted external document candidates',
      );

      for (const link of candidateLinks.slice(0, 12)) {
        try {
          let linkCookies: string | undefined;
          try {
            const linkUrl = new URL(link);
            if (linkUrl.hostname.includes('udbud.dk')) {
              linkCookies = cookies;
            }
          } catch {
            // ignore URL parse error
          }
          const result = await this.downloader.discoverAndDownloadFromPage(link, destDir, {
            timeout: 25000,
            maxRetries: 2,
            cookies: linkCookies,
          });
          aggregate.downloaded.push(...result.downloaded);
          aggregate.failed.push(...result.failed);
          aggregate.skipped.push(...result.skipped);

          // Stop early once we successfully downloaded at least one file.
          if (aggregate.downloaded.length > 0) {
            return aggregate;
          }
        } catch (error: any) {
          this.logger.warn({ link, error: error.message }, 'Udbud.dk: failed to process extracted candidate link');
          aggregate.failed.push(link);
        }
      }
    }

    const directResult = await this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
      cookies,
    });
    aggregate.downloaded.push(...directResult.downloaded);
    aggregate.failed.push(...directResult.failed);
    aggregate.skipped.push(...directResult.skipped);

    if (aggregate.downloaded.length > 0) {
      return aggregate;
    }

    this.logger.warn({ documentsUrl }, 'Udbud.dk: no downloadable attachments found on external/portal links; storing notice HTML fallback');
    const noticeFallback = await this.saveUdbudNoticeFallback(documentsUrl, destDir, cookies);
    aggregate.downloaded.push(...noticeFallback.downloaded);
    aggregate.failed.push(...noticeFallback.failed);
    aggregate.skipped.push(...noticeFallback.skipped);

    return aggregate;
  }

  private async saveUdbudNoticeFallback(documentsUrl: string, destDir: string, cookies: string): Promise<DownloadResult> {
    const downloaded: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    try {
      const parsed = new URL(documentsUrl);
      const noticeId = parsed.searchParams.get('noticeId');
      const noticeVersion = parsed.searchParams.get('noticeVersion') || '01';
      const noticePublicationNumber = parsed.searchParams.get('noticePublicationNumber') || '';
      if (!noticeId) {
        return { downloaded, failed: [documentsUrl], skipped };
      }

      const visningUrl = `https://udbud.dk/soegning/visning/${encodeURIComponent(noticeId)}/${encodeURIComponent(noticeVersion)}${noticePublicationNumber ? `?noticePublicationNumber=${encodeURIComponent(noticePublicationNumber)}` : ''}`;

      const payload = await this.httpClient.get<any>(visningUrl, {
        timeout: 20000,
        maxRetries: 2,
        cookies,
      });

      const writeIfPresent = (filename: string, html: string | undefined | null): void => {
        if (typeof html !== 'string' || !html.trim()) return;
        const outPath = path.join(destDir, filename);
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
          skipped.push(outPath);
          return;
        }
        fs.writeFileSync(outPath, html, 'utf8');
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
          downloaded.push(outPath);
        }
      };

      writeIfPresent('notice_da.html', payload?.htmlDA);
      writeIfPresent('notice_en.html', payload?.htmlEN);

      if (downloaded.length === 0 && skipped.length === 0) {
        failed.push(visningUrl);
      }
    } catch (error: any) {
      this.logger.warn({ documentsUrl, error: error.message }, 'Udbud.dk: failed to store notice HTML fallback');
      failed.push(documentsUrl);
    }

    return { downloaded, failed, skipped };
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

      const priorityCandidates: string[] = [];
      const daDocs = Array.isArray(payload?.opsummeringDA?.udbudsDokumenter)
        ? payload.opsummeringDA.udbudsDokumenter
        : [];
      const enDocs = Array.isArray(payload?.opsummeringEN?.udbudsDokumenter)
        ? payload.opsummeringEN.udbudsDokumenter
        : [];

      for (const link of [...daDocs, ...enDocs]) {
        if (typeof link === 'string' && link.trim()) {
          priorityCandidates.push(link.trim());
        }
      }

      const htmlDa = typeof payload?.htmlDA === 'string' ? payload.htmlDA : '';
      const htmlEn = typeof payload?.htmlEN === 'string' ? payload.htmlEN : '';
      const combined = `${htmlDa}\n${htmlEn}`;
      const urlMatches = combined.match(/https?:\/\/[^\s"'<>]+/g) || [];

      const normalize = (raw: string): string | null => {
        const decoded = raw
          .trim()
          .replace(/&amp;/g, '&')
          .replace(/[).,;]+$/, '');

        const maybeAbsolute = /^www\./i.test(decoded) ? `https://${decoded}` : decoded;
        if (!/^https?:\/\//i.test(maybeAbsolute)) return null;
        return maybeAbsolute;
      };

      const seen = new Set<string>();
      const combinedCandidates: string[] = [];
      for (const candidate of [...priorityCandidates, ...urlMatches]) {
        const normalized = normalize(candidate);
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        combinedCandidates.push(normalized);
      }

      const isBoilerplate = (lower: string): boolean => {
        return (
          lower.includes('w3.org') ||
          lower.includes('data.europa.eu') ||
          lower.includes('kfst.dk') ||
          lower.includes('naevneneshus.dk') ||
          lower.includes('klfu.dk')
        );
      };

      const scoreCandidate = (url: string): number => {
        const lower = url.toLowerCase();
        let score = 0;

        if (priorityCandidates.some((p) => normalize(p) === url)) score += 100;
        if (lower.includes('tenderinformationshow')) score += 40;
        if (lower.includes('publicmaterial')) score += 40;
        if (lower.includes('rwlentrance_s.asp')) score += 30;
        if (lower.includes('mercell') || lower.includes('comdia') || lower.includes('eu-supply')) score += 25;
        if (lower.includes('ethics') || lower.includes('dalux') || lower.includes('c-web') || lower.includes('rib-software')) score += 20;
        if (lower.includes('anchordocuments')) score += 15;
        if (/\.pdf($|\?)/i.test(lower) || /\.zip($|\?)/i.test(lower)) score += 20;

        return score;
      };

      return combinedCandidates
        .filter((url) => !isBoilerplate(url.toLowerCase()))
        .sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    } catch (error: any) {
      this.logger.warn({ documentsUrl, error: error.message }, 'Udbud.dk: failed to extract visning API document candidates');
      return [];
    }
  }
}
