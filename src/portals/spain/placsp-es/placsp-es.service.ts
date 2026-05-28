import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { BaseScraperService } from '../../../shared/base/base-scraper.service';
import { HttpClientService } from '../../../shared/http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../../../shared/document-downloader.service';
import { OutputManagerService } from '../../../shared/output-manager.service';
import { WebSphereSessionService } from './websphere-session.service';
import { CaptchaSolverService } from '../../../shared/anti-bot/captcha-solver.service';
import { CreateProcurementInput } from '../../../schema/procurement.types';
import * as cheerio from 'cheerio';

@Injectable()
export class PlacspEsService extends BaseScraperService {
  readonly portalName = 'placsp-es';
  readonly locale = 'es';

  private readonly searchUrl =
    'https://contrataciondelestado.es/wps/portal/plataforma';

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    private readonly sessionService: WebSphereSessionService,
    private readonly captchaSolver: CaptchaSolverService,
    @InjectPinoLogger(PlacspEsService.name)
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  protected async fetchListings(): Promise<any[]> {
    this.logger.info('Fetching listings from PLACSP (production)');

    let cookies = '';
    try {
      cookies = await this.sessionService.initSession();
      this.logger.info({ cookiesLength: cookies.length }, 'WebSphere session initialized');
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'WebSphere session init failed; attempting without session');
    }

    try {
      // PLACSP exposes an Atom/RSS feed for recent licitaciones
      const atomUrl =
        'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';
      
      let atomXml: string;
      try {
        atomXml = await this.httpClient.getText(atomUrl, {
          timeout: 15000,
          maxRetries: 2,
          cookies,
        });
      } catch {
        // Fallback to main search page HTML
        atomXml = '';
      }

      if (atomXml && atomXml.includes('<entry>')) {
        return this.parseAtomFeed(atomXml);
      }

      // Fallback: scrape the HTML search page
      const html = await this.httpClient.getText(this.searchUrl, {
        timeout: 15000,
        maxRetries: 2,
        cookies,
      });

      return this.parseHtmlListings(html);
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to fetch PLACSP listings');
      return [];
    }
  }

  private extractPlacspTenderId(rawId: string, fallbackUrl: string, index: number): string {
    const candidates = [rawId, fallbackUrl].filter(Boolean);

    for (const value of candidates) {
      const profileMatch = value.match(/licitacionesPerfilContratante\/(\d+)/i);
      if (profileMatch?.[1]) return profileMatch[1];

      try {
        const parsed = new URL(value);
        const idEvl = parsed.searchParams.get('idEvl');
        if (idEvl) return `idEvl_${encodeURIComponent(idEvl)}`;

        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const tail = pathParts[pathParts.length - 1];
        if (tail) return tail;
      } catch {
        // not a URL; continue
      }

      const numericTail = value.match(/(\d{5,})$/);
      if (numericTail?.[1]) return numericTail[1];
    }

    return `placsp-${index}`;
  }

  private parseAtomFeed(xml: string): any[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const listings: any[] = [];

    $('entry').each((_i, entry) => {
      const $entry = $(entry);
      const idText = $entry.find('id').text().trim();
      const title = $entry.find('title').text().trim();
      const summary = $entry.find('summary').text().trim();
      const link = $entry.find('link[rel="alternate"]').attr('href') ||
        $entry.find('link').attr('href') || '';

      if (!title) return;

      const id = this.extractPlacspTenderId(idText, link, _i);

      listings.push({
        id,
        title,
        shortDescription: summary || title,
        documentsUrl: link,
        portalUrl: link,
        estimatedValue: null,
      });
    });

    this.logger.info({ listingsCount: listings.length }, 'Parsed PLACSP Atom feed entries');
    return listings;
  }

  private parseHtmlListings(html: string): any[] {
    const $ = cheerio.load(html);
    const listings: any[] = [];

    $('a[href*="licitacion"], a[href*="expediente"]').each((_i, el) => {
      const href = $(el).attr('href') || '';
      if (!href) return;

      const absoluteUrl = href.startsWith('http')
        ? href
        : `https://contrataciondelestado.es${href}`;

      const id = this.extractPlacspTenderId(href, absoluteUrl, _i);

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

    this.logger.info({ listingsCount: listings.length }, 'Parsed PLACSP HTML listings');
    return listings;
  }

  protected async mapToProcurement(raw: any): Promise<CreateProcurementInput> {
    const portalUrl = raw.portalUrl || `https://contrataciondelestado.es/notice/${raw.id || 'unknown'}`;
    return {
      sourceArray: [
        {
          __type: 'PlacspSource',
          expedienteId: raw.expedienteId || raw.id || 'EXP-UNKNOWN',
          licitacionId: raw.licitacionId || raw.id || 'LIC-UNKNOWN',
          portalUrl,
        },
      ],
      tender: {
        status: 'OPEN',
        title: { es: raw.title },
        shortDescription: { es: raw.shortDescription },
        longDescription: { es: raw.shortDescription },
        procurementType: 'SERVICES',
        procedureType: 'OPEN',
        estimatedValue: raw.estimatedValue
          ? { amount: raw.estimatedValue, currency: 'EUR' }
          : null,
        cpvCodeArray: [],
        languageCodeArray: ['es'],
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
          allowedLanguageCodeArray: ['es'],
          electronicSubmissionRequired: true,
          electronicSubmissionUrl: portalUrl,
          tenderValidityDays: null,
          openingDate: null,
          openingPlace: null,
          openingDescription: null,
        },
        reviewInformation: {
          bodyName: 'Tribunal Administrativo Central de Recursos Contractuales',
          address: null,
          contact: null,
          deadlines: null,
        },
        lotArray: [],
      },
      contractingBodyArray: [
        {
          officialName: 'Unknown (parsed from PLACSP)',
          nationalRegistrationNumber: null,
          location: {
            description: 'España',
            address: {
              streetAddress: null,
              city: null,
              postalCode: null,
              country: 'España',
            },
            nutsCodes: [],
          },
          contact: {
            contactPoint: null,
            email: null,
            telephone: null,
            url: portalUrl,
          },
          organisationType: 'MINISTRY',
          mainActivity: 'GENERAL_PUBLIC_SERVICES',
          isMain: true,
        },
      ],
    };
  }

  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading pliegos from PLACSP (production)');

    // Attempt to solve any captcha if the download page requires it
    try {
      const cookies = this.sessionService.getSerializedCookies();

      return await this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
        timeout: 25000,
        maxRetries: 2,
        cookies,
      });
    } catch (error: any) {
      this.logger.error({ error: error.message, documentsUrl }, 'PLACSP document download failed');
      return { downloaded: [], failed: [documentsUrl], skipped: [] };
    }
  }
}
