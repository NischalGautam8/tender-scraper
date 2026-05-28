import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HttpClientService } from '../shared/http-client.service';
import { DiscoveredTender } from './oev-api.types';
import AdmZip from 'adm-zip';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class DiscoveryService {
  private readonly domainRegistry = new Map<string, string>([
    ['dtvp.de', 'dtvp'],
    ['www.dtvp.de', 'dtvp'],
    ['deutsche-evergabe.de', 'deutsche-evergabe'],
    ['www.deutsche-evergabe.de', 'deutsche-evergabe'],
    ['evergabe.de', 'evergabe-de'],
    ['www.evergabe.de', 'evergabe-de'],
    ['bi-medien.de', 'bi-medien'],
    ['vergabe.hamburgwasser.de', 'hamburg-wasser'],
    ['fbhh-evergabe.web.hamburg.de', 'fbhh-hamburg'],
    ['vergabeplattform.charite.de', 'charite-berlin'],
    ['vergabekooperation.berlin', 'vergabekooperation-berlin'],
    ['www.evergabe.sachsen.de', 'sachsen-evergabe'],
    ['udbud.dk', 'udbud-dk'],
    ['www.udbud.dk', 'udbud-dk'],
    ['contrataciondelestado.es', 'placsp-es'],
    ['www.contrataciondelestado.es', 'placsp-es'],
  ]);

  constructor(
    private readonly httpClient: HttpClientService,
    @InjectPinoLogger(DiscoveryService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Resolves a sub-portal URL to a registered module name.
   * Returns null if the domain is unrecognized.
   */
  resolveSubPortal(subPortalUrl: string): string | null {
    try {
      const parsed = new URL(subPortalUrl);
      const host = parsed.hostname;
      
      let module = this.domainRegistry.get(host);
      if (module) return module;

      for (const [registeredDomain, mappedModule] of this.domainRegistry.entries()) {
        if (host === registeredDomain || host.endsWith('.' + registeredDomain)) {
          return mappedModule;
        }
      }

      if (host.toLowerCase().includes('netserver')) {
        return 'sachsen-evergabe';
      }

      this.logger.warn({ host, url: subPortalUrl }, 'Unknown sub-portal domain, skipping dispatch');
      return null;
    } catch (error: any) {
      this.logger.error({ url: subPortalUrl, error: error.message }, 'Failed to parse sub-portal URL');
      return null;
    }
  }

  /**
   * Fetches notices from the öffentlichevergabe.de OpenData API.
   * Paginates through all available pages up to a cap.
   * No mock fallback — production only.
   */
  async discoverAll(): Promise<DiscoveredTender[]> {
    this.logger.info('Starting öffentlichevergabe.de exports API discovery (production mode)');
    const discovered: DiscoveredTender[] = [];
    const daysToFetch = 3;

    // Make sure output/ directory exists
    const outputDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (let i = 1; i <= daysToFetch; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const formattedDate = date.toISOString().split('T')[0];

      const apiUrl = `https://oeffentlichevergabe.de/api/notice-exports?pubDay=${formattedDate}&format=ocds.zip`;
      const tempZipPath = path.join(outputDir, `temp-ocds-${formattedDate}-${Date.now()}.zip`);

      this.logger.info({ formattedDate, apiUrl }, 'Downloading bulk notice export from öV API');

      try {
        await this.httpClient.downloadStream(apiUrl, tempZipPath);
        
        if (!fs.existsSync(tempZipPath) || fs.statSync(tempZipPath).size === 0) {
          this.logger.warn({ formattedDate }, 'Downloaded ZIP file is empty or missing');
          continue;
        }

        this.logger.info({ formattedDate }, 'Extracting and parsing OCDS ZIP export');
        const zip = new AdmZip(tempZipPath);
        const zipEntries = zip.getEntries();
        let dayDiscoveredCount = 0;

        for (const entry of zipEntries) {
          if (!entry.entryName.endsWith('.json')) {
            continue;
          }

          try {
            const contentText = entry.getData().toString('utf8');
            const parsed = JSON.parse(contentText);
            
            if (!parsed || !Array.isArray(parsed.releases)) {
              continue;
            }

            for (const release of parsed.releases) {
              const tender = release.tender;
              if (!tender) {
                continue;
              }

              const id = release.id || tender.id || `notice-${Date.now()}`;
              const title = tender.title || 'Untitled Notice';
              const shortDescription = tender.description || '';

              let documentsUrl: string | null = null;
              if (Array.isArray(tender.documents)) {
                // First try to find a document URL resolving to a recognized portal
                for (const doc of tender.documents) {
                  if (doc.url && this.resolveSubPortal(doc.url)) {
                    documentsUrl = doc.url;
                    break;
                  }
                }
                // Fall back to first document URL if none matched a registered portal
                if (!documentsUrl && tender.documents.length > 0) {
                  documentsUrl = tender.documents[0].url || null;
                }
              }

              if (!documentsUrl) {
                this.logger.debug({ noticeId: id }, 'Skipping notice without documents URL');
                continue;
              }

              const moduleName = this.resolveSubPortal(documentsUrl);
              if (!moduleName) {
                continue;
              }

              discovered.push({
                id,
                title,
                shortDescription,
                documentsUrl,
                portalUrl: documentsUrl,
                subPortalModule: moduleName,
                rawResponse: release,
              });
              dayDiscoveredCount++;
            }
          } catch (entryError: any) {
            this.logger.warn({ entryName: entry.entryName, error: entryError.message }, 'Failed to parse ZIP entry json');
          }
        }

        this.logger.info({ formattedDate, count: dayDiscoveredCount }, 'Finished processing notices for day');
      } catch (error: any) {
        this.logger.warn(
          { formattedDate, error: error.message },
          'Failed to fetch or process notice export for day',
        );
      } finally {
        try {
          if (fs.existsSync(tempZipPath)) {
            fs.unlinkSync(tempZipPath);
          }
        } catch (cleanupError: any) {
          this.logger.error({ tempZipPath, error: cleanupError.message }, 'Failed to clean up temp ZIP file');
        }
      }
    }

    this.logger.info({ discoveredCount: discovered.length }, 'Discovery complete (production)');
    return discovered;
  }
}
