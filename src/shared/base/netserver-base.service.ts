import { BaseScraperService } from './base-scraper.service';
import { HttpClientService } from '../http-client.service';
import { DocumentDownloaderService, DownloadResult } from '../document-downloader.service';
import { OutputManagerService } from '../output-manager.service';
import { PinoLogger } from 'nestjs-pino';
import { CreateProcurementInput } from '../../schema/procurement.types';
import * as cheerio from 'cheerio';

/**
 * Abstract base class for all Cosinex/NetServer-based portals.
 * NetServer portals share an identical underlying system structure:
 * - Publication search: /NetServer/PublicationSearchControllerServlet
 * - Document downloads: /NetServer/TenderingProcedureDetails?id=...
 * - Unified HTML element class names and structures.
 */
export abstract class NetServerBaseService extends BaseScraperService {
  abstract readonly baseUrl: string;

  constructor(
    httpClient: HttpClientService,
    downloader: DocumentDownloaderService,
    outputManager: OutputManagerService,
    logger: PinoLogger,
  ) {
    super(httpClient, downloader, outputManager, logger);
  }

  /**
   * Fetches publication search results from the Cosinex/NetServer portal.
   * Parses the search results HTML table to extract real tender listings.
   */
  protected async fetchListings(): Promise<any[]> {
    const searchUrl = `${this.baseUrl}/PublicationSearchControllerServlet`;
    this.logger.info({ searchUrl }, 'Fetching publications from NetServer (production)');

    try {
      const htmlContent = await this.httpClient.getText(searchUrl, {
        timeout: 15000,
        maxRetries: 2,
      });
      this.logger.info({ htmlLength: htmlContent.length }, 'Fetched NetServer search page HTML');

      const $ = cheerio.load(htmlContent);
      const listings: any[] = [];

      // NetServer portals render search results in table rows with class
      // 'publicationListRow' or within '#publicationList tbody tr'
      const rows = $('table.list tbody tr, #publicationList tbody tr, .publicationListRow, table tr[data-id]');

      if (rows.length === 0) {
        // Fallback: look for generic table rows containing links
        $('table tr').each((_i, row) => {
          const link = $(row).find('a[href*="TenderingProcedureDetails"]');
          if (link.length === 0) return;

          const href = link.attr('href') || '';
          const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}/${href.replace(/^\/+/, '')}`;

          // Extract ID from URL query parameter
          const idMatch = href.match(/[?&]id=([^&]+)/);
          const id = idMatch ? idMatch[1] : `${this.portalName}-${_i}`;

          const cells = $(row).find('td');
          const title = link.text().trim() || cells.eq(0).text().trim() || `Tender ${id}`;
          const description = cells.eq(1)?.text().trim() || '';

          listings.push({
            id,
            title,
            shortDescription: description || title,
            documentsUrl: fullUrl,
            portalUrl: fullUrl,
            estimatedValue: null,
          });
        });
      } else {
        rows.each((_i, row) => {
          const $row = $(row);
          const link = $row.find('a[href*="TenderingProcedureDetails"]').first();
          const href = link.attr('href') || '';

          if (!href) return;

          const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}/${href.replace(/^\/+/, '')}`;
          const idMatch = href.match(/[?&]id=([^&]+)/);
          const id = $row.attr('data-id') || (idMatch ? idMatch[1] : `${this.portalName}-${_i}`);

          const title = link.text().trim() ||
            $row.find('.publicationTitle, .title, td:first-child').text().trim() ||
            `Tender ${id}`;

          const description = $row.find('.publicationDescription, .description, td:nth-child(2)').text().trim();

          listings.push({
            id,
            title,
            shortDescription: description || title,
            documentsUrl: fullUrl,
            portalUrl: fullUrl,
            estimatedValue: null,
          });
        });
      }

      this.logger.info(
        { listingsCount: listings.length, portalName: this.portalName },
        'Parsed NetServer publication listings',
      );

      return listings;
    } catch (error: any) {
      this.logger.error(
        { error: error.message, searchUrl },
        'Failed to fetch or parse NetServer search page',
      );
      return [];
    }
  }

  /**
   * Downloads attachments from a Cosinex/NetServer detail endpoint.
   * Fetches the tender detail page, discovers download links, and downloads them.
   */
  protected async downloadDocuments(documentsUrl: string, destDir: string): Promise<DownloadResult> {
    this.logger.info({ documentsUrl, destDir }, 'Downloading attachments from NetServer portal (production)');

    return this.downloader.discoverAndDownloadFromPage(documentsUrl, destDir, {
      timeout: 20000,
      maxRetries: 2,
    });
  }
}
