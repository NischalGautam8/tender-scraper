import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { HttpClientService, RequestOptions } from './http-client.service';

import { BrowserPoolService } from './anti-bot/browser-pool.service';

export interface DocumentRef {
  url: string;
  filename?: string;    // Preferred filename from portal
  mimeType?: string;
}

export interface DownloadResult {
  downloaded: string[];  // Paths of successfully downloaded files
  failed: string[];      // URLs that failed after retries
  skipped: string[];     // Already existed on disk
}

/** File extensions we consider downloadable documents */
const DOC_EXTENSIONS = new Set([
  '.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx',
  '.ppt', '.pptx', '.odt', '.ods', '.csv', '.xml',
  '.rar', '.7z', '.tar', '.gz', '.rtf', '.txt',
]);

@Injectable()
export class DocumentDownloaderService {
  constructor(
    private readonly httpClient: HttpClientService,
    private readonly browserPool: BrowserPoolService,
    @InjectPinoLogger(DocumentDownloaderService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Download a single file.
   * @returns path to the downloaded file, or null if failed
   */
  /**
   * Detect if file content looks like an HTML page (login page, error page, etc.)
   * by reading the first few bytes.
   */
  private isHtmlContent(filePath: string): boolean {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(512);
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);

      if (bytesRead === 0) return false;

      const head = buffer.slice(0, bytesRead).toString('utf8').trimStart().toLowerCase();
      return (
        head.startsWith('<!doctype html') ||
        head.startsWith('<html') ||
        head.startsWith('<?xml') && head.includes('<html')
      );
    } catch {
      return false;
    }
  }

  /**
   * Infer file extension from magic bytes when the filename has none.
   */
  private inferExtensionFromMagicBytes(filePath: string): string | null {
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(8);
      const bytesRead = fs.readSync(fd, buffer, 0, 8, 0);
      fs.closeSync(fd);

      if (bytesRead < 4) return null;

      // PDF: starts with %PDF
      if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return '.pdf';
      }
      // ZIP/DOCX/XLSX/PPTX/ODT: starts with PK (0x50 0x4B)
      if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
        return '.zip';
      }
      // RAR: starts with Rar!
      if (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
        return '.rar';
      }
      // 7z: starts with 7z¼¯
      if (buffer[0] === 0x37 && buffer[1] === 0x7A && buffer[2] === 0xBC && buffer[3] === 0xAF) {
        return '.7z';
      }
      // GZip: starts with 1f 8b
      if (buffer[0] === 0x1F && buffer[1] === 0x8B) {
        return '.gz';
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Download a single file.
   * @returns path to the downloaded file, or null if failed
   */
  async downloadFile(
    url: string,
    destDir: string,
    preferredFilename?: string,
    options: RequestOptions = {},
  ): Promise<string | null> {
    try {
      // Create destDir if not exists
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Determine filename
      let filename = preferredFilename;
      if (!filename) {
        const parsedUrl = new URL(url);
        filename = path.basename(parsedUrl.pathname);
        if (!filename || filename === '/' || filename.trim() === '') {
          filename = `document_${Date.now()}`;
        }
      }

      // Sanitize filename to avoid folder traversal or illegal characters
      filename = filename.replace(/[/\\?%*:|"<>\s]/g, '_');

      let destPath = path.join(destDir, filename);
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      let counter = 1;

      while (fs.existsSync(destPath)) {
        destPath = path.join(destDir, `${base}-${counter}${ext}`);
        counter++;
      }

      this.logger.info({ url, destPath }, 'Downloading document');
      await this.httpClient.downloadStream(url, destPath, options);

      // Verify file exists and is non-empty
      if (!fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
        this.logger.warn({ destPath }, 'Downloaded file is 0 bytes or missing; counting as failure');
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return null;
      }

      // Reject HTML pages (login walls, error pages, redirects)
      if (this.isHtmlContent(destPath)) {
        this.logger.warn(
          { url, destPath },
          'Downloaded content is an HTML page (likely a login/redirect); discarding',
        );
        fs.unlinkSync(destPath);
        return null;
      }

      // If filename has no extension, try to infer one from magic bytes
      if (!ext) {
        const inferredExt = this.inferExtensionFromMagicBytes(destPath);
        if (inferredExt) {
          const newDestPath = `${destPath}${inferredExt}`;
          fs.renameSync(destPath, newDestPath);
          destPath = newDestPath;
          this.logger.info({ destPath, inferredExt }, 'Inferred file extension from magic bytes');
        }
      }

      const stats = fs.statSync(destPath);
      this.logger.info({ destPath, sizeBytes: stats.size }, 'Successfully downloaded document');
      return destPath;
    } catch (error: any) {
      this.logger.error({ url, error: error.message }, 'Failed to download document');
      return null;
    }
  }

  /**
   * Download all documents for a tender.
   */
  async downloadAllDocuments(
    documents: DocumentRef[],
    tenderOutputDir: string,
    options: RequestOptions = {},
  ): Promise<DownloadResult> {
    const downloaded: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const doc of documents) {
      if (doc.filename) {
        const sanitizedFilename = doc.filename.replace(/[/\\?%*:|"<>\s]/g, '_');
        const expectedPath = path.join(tenderOutputDir, sanitizedFilename);
        if (fs.existsSync(expectedPath) && fs.statSync(expectedPath).size > 0) {
          this.logger.info({ filename: doc.filename }, 'File already exists with non-zero size; skipping download (idempotency)');
          skipped.push(expectedPath);
          continue;
        }
      }

      const filePath = await this.downloadFile(doc.url, tenderOutputDir, doc.filename, options);
      if (filePath) {
        downloaded.push(filePath);
      } else {
        failed.push(doc.url);
      }
    }

    return { downloaded, failed, skipped };
  }

  /**
   * Determines whether a URL points directly to a downloadable file
   * based on its extension.
   */
  isDirectFileUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      let pathname = parsedUrl.pathname;
      
      // Strip ;jsessionid=... or similar session parameter suffixes
      const semiColonIndex = pathname.indexOf(';');
      if (semiColonIndex !== -1) {
        pathname = pathname.substring(0, semiColonIndex);
      }
      
      const ext = path.extname(pathname).toLowerCase();
      return DOC_EXTENSIONS.has(ext);
    } catch {
      return false;
    }
  }

  /**
   * Fetches a web page, discovers all document download links on it,
   * and downloads each one to the destination directory.
   *
   * If the URL itself is a direct file link (e.g. ends in .pdf),
   * it downloads the file directly without page parsing.
   */
  async discoverAndDownloadFromPage(
    pageUrl: string,
    destDir: string,
    options: RequestOptions = {},
  ): Promise<DownloadResult> {
    // Case 1: The URL is a direct file download
    if (this.isDirectFileUrl(pageUrl)) {
      this.logger.info({ pageUrl }, 'URL is a direct file link; downloading directly');
      const filePath = await this.downloadFile(pageUrl, destDir, undefined, options);
      return {
        downloaded: filePath ? [filePath] : [],
        failed: filePath ? [] : [pageUrl],
        skipped: [],
      };
    }

    const host = new URL(pageUrl).hostname;

    // --- PORTAL SPECIFIC HANDLING ---

    // bi-medien: tender detail pages often require opening the "Dokumente/Unterlagen"
    // tab before file links become visible.
    if (host.includes('bi-medien.de')) {
      return this.handleBiMedienDocumentsPage(pageUrl, destDir, options);
    }

    // Custom session/redirect hopping for Cosinex/NetServer-based portals
    if (
      host.includes('dtvp.de') ||
      host.includes('deutsche-evergabe.de') ||
      host.includes('evergabe.sachsen.de') ||
      host.includes('sachsen-vergabe.de') ||
      host.includes('hamburgwasser.de') ||
      host.includes('vergabekooperation.berlin') ||
      host.includes('vergabeplattform.charite.de')
    ) {
      this.logger.info({ pageUrl }, 'Performing cookie redirect session hopping for Cosinex portal');
      try {
        let currentUrl = pageUrl;
        let cookies: string[] = [];
        let html = '';
        let finalUrl = '';

        for (let hop = 0; hop < 6; hop++) {
          const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
          const res = await this.httpClient.getResponse<any>(currentUrl, {
            followRedirects: false,
            headers: cookieHeader ? { 'Cookie': cookieHeader } : undefined,
            timeout: 10000,
          }, 'text');

          const newCookies = res.headers['set-cookie'];
          if (newCookies) {
            cookies = [...cookies, ...newCookies];
          }

          if (res.status === 302 || res.status === 301) {
            const location = res.headers['location'];
            currentUrl = new URL(location, currentUrl).toString();
          } else {
            html = res.data as string;
            finalUrl = currentUrl;
            break;
          }
        }

        if (html) {
          const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');

          // Search for ANY downloadable file links, not just .zip
          const $page = cheerio.load(html);
          const docLinks: { url: string; filename?: string }[] = [];

          $page('a[href]').each((_i, el) => {
            const href = $page(el).attr('href');
            if (!href) return;
            let cleanHref = href;
            const semiIdx = cleanHref.indexOf(';');
            if (semiIdx !== -1) cleanHref = cleanHref.substring(0, semiIdx);
            const ext = path.extname(cleanHref).toLowerCase();
            if (DOC_EXTENSIONS.has(ext)) {
              const absoluteUrl = new URL(href, finalUrl).toString();
              docLinks.push({ url: absoluteUrl, filename: $page(el).text().trim() || undefined });
            }
          });

          if (docLinks.length > 0) {
            this.logger.info({ count: docLinks.length }, 'Found downloadable file links on Cosinex page; downloading with session cookies');
            const results: DownloadResult = { downloaded: [], failed: [], skipped: [] };
            for (const link of docLinks) {
              const filePath = await this.downloadFile(link.url, destDir, link.filename, {
                headers: { 'Cookie': cookieHeader, 'Referer': finalUrl },
              });
              if (filePath) {
                results.downloaded.push(filePath);
              } else {
                results.failed.push(link.url);
              }
            }
            if (results.downloaded.length > 0) {
              return results;
            }
          }

          // Second hop: look for links to the actual tender detail/documents page
          // (e.g. deutsche-evergabe dashboard pages link to TenderingProcedureDetails)
          const detailLinks: string[] = [];
          $page('a[href]').each((_i, el) => {
            const href = $page(el).attr('href');
            if (!href) return;
            if (
              href.includes('TenderingProcedureDetails') ||
              href.includes('/documents') ||
              href.includes('/document') ||
              href.includes('/Satellite/public') ||
              href.includes('PublicationControllerServlet')
            ) {
              detailLinks.push(new URL(href, finalUrl).toString());
            }
          });

          for (const detailUrl of detailLinks.slice(0, 3)) {
            this.logger.info({ detailUrl }, 'Following internal link to tender detail page');
            try {
              let detailHtml = '';
              let detailFinalUrl = detailUrl;

              // Session hop into the detail page
              let navUrl = detailUrl;
              for (let hop = 0; hop < 4; hop++) {
                const res = await this.httpClient.getResponse<any>(navUrl, {
                  followRedirects: false,
                  headers: { 'Cookie': cookieHeader },
                  timeout: 10000,
                }, 'text');

                const newCookies2 = res.headers['set-cookie'];
                if (newCookies2) {
                  cookies = [...cookies, ...newCookies2];
                }

                if (res.status === 302 || res.status === 301) {
                  navUrl = new URL(res.headers['location'], navUrl).toString();
                } else {
                  detailHtml = res.data as string;
                  detailFinalUrl = navUrl;
                  break;
                }
              }

              if (!detailHtml) continue;

              let $detail = cheerio.load(detailHtml);
              const updatedCookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
              let workingDetailUrl = detailFinalUrl;

              // Some NetServer pages (e.g. vergabekooperation.berlin) expose a first
              // publication page that links to a second TenderingProcedureDetails page
              // where the actual document modal/download controls exist.
              if ($detail('a.zipFileContents[data-oid]').length === 0) {
                const nestedHref = $detail('a[href*="TenderingProcedureDetails"][href*="function=_Details"]').first().attr('href');
                if (nestedHref) {
                  try {
                    const nestedUrl = new URL(nestedHref, workingDetailUrl).toString();
                    if (nestedUrl !== workingDetailUrl) {
                      this.logger.info({ nestedUrl, detailUrl }, 'Following nested NetServer tender detail link');
                      const nestedHtml = await this.httpClient.getText(nestedUrl, {
                        headers: { 'Cookie': updatedCookieHeader, 'Referer': workingDetailUrl },
                        timeout: 10000,
                      });
                      $detail = cheerio.load(nestedHtml);
                      workingDetailUrl = nestedUrl;
                    }
                  } catch (nestedErr: any) {
                    this.logger.warn({ detailUrl, error: nestedErr.message }, 'Failed to follow nested NetServer detail link');
                  }
                }
              }

              const detailDocLinks: { url: string; filename?: string }[] = [];

              $detail('a[href]').each((_i, el) => {
                const href = $detail(el).attr('href');
                if (!href) return;
                let cleanHref = href;
                const semiIdx = cleanHref.indexOf(';');
                if (semiIdx !== -1) cleanHref = cleanHref.substring(0, semiIdx);
                const ext = path.extname(cleanHref).toLowerCase();
                if (DOC_EXTENSIONS.has(ext)) {
                  detailDocLinks.push({
                    url: new URL(href, workingDetailUrl).toString(),
                    filename: $detail(el).text().trim() || undefined,
                  });
                }
              });

              // NetServer/Cosinex variant: document links are generated via modal + DataProvider,
              // and the public fallback download endpoint is _DownloadTenderDocuments&documentOID=<SpecificationVersionOID>.
              const modalDocOidList: string[] = [];
              $detail('a.zipFileContents[data-oid]').each((_i, el) => {
                const oid = $detail(el).attr('data-oid');
                if (oid) {
                  modalDocOidList.push(oid);
                }
              });

              if (modalDocOidList.length > 0) {
                this.logger.info({ count: modalDocOidList.length, detailUrl }, 'Found NetServer modal document OIDs on detail page');
                const results: DownloadResult = { downloaded: [], failed: [], skipped: [] };

                for (const oid of modalDocOidList) {
                  const downloadAllUrl = new URL(
                    `TenderingProcedureDetails?function=_DownloadTenderDocuments&documentOID=${encodeURIComponent(oid)}`,
                    workingDetailUrl,
                  ).toString();

                  const filePath = await this.downloadFile(downloadAllUrl, destDir, `${oid}.zip`, {
                    headers: { 'Cookie': updatedCookieHeader, 'Referer': workingDetailUrl },
                  });

                  if (filePath) {
                    results.downloaded.push(filePath);
                  } else {
                    results.failed.push(downloadAllUrl);
                  }
                }

                if (results.downloaded.length > 0) {
                  return results;
                }
              }

              if (detailDocLinks.length > 0) {
                this.logger.info({ count: detailDocLinks.length, detailUrl }, 'Found downloadable files on detail page');
                const results: DownloadResult = { downloaded: [], failed: [], skipped: [] };
                for (const link of detailDocLinks) {
                  const filePath = await this.downloadFile(link.url, destDir, link.filename, {
                    headers: { 'Cookie': updatedCookieHeader, 'Referer': workingDetailUrl },
                  });
                  if (filePath) {
                    results.downloaded.push(filePath);
                  } else {
                    results.failed.push(link.url);
                  }
                }
                if (results.downloaded.length > 0) {
                  return results;
                }
              }
            } catch (detailErr: any) {
              this.logger.warn({ detailUrl, error: detailErr.message }, 'Failed to follow detail link');
            }
          }
        }
      } catch (sessionErr: any) {
        this.logger.warn({ error: sessionErr.message }, 'Cookie session hopping failed for Cosinex portal');
      }

      // Cosinex-specific: Try fetching the tender detail modal via the BekSummaryModal API
      // The dashboard page renders a DevExtreme grid with an "i" icon button.
      // Clicking it triggers an AJAX request to /verfahren/BekSummaryModal/<GUID>
      // The response HTML contains document download links.
      try {
        const urlObj = new URL(pageUrl);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        // The GUID is the last segment of the dashboard URL
        const tenderGuid = pathParts[pathParts.length - 1];
        if (tenderGuid && tenderGuid.match(/^[0-9a-f-]{20,}$/i)) {
          const modalUrl = `${urlObj.origin}/verfahren/BekSummaryModal/${tenderGuid}?isProd=true&FullSize=false&DashOff=true`;
          this.logger.info({ modalUrl }, 'Trying Cosinex BekSummaryModal API for document links');

          const modalHtml = await this.httpClient.getText(modalUrl, { timeout: 15000, maxRetries: 2 });
          if (modalHtml) {
            const $modal = cheerio.load(modalHtml);
            const modalDocLinks: { url: string; filename?: string }[] = [];

            // Check if there is a dynamic file API (like in deutsche-evergabe)
            const fileApiUrl = $modal('#Action_dxVUFilesForSupplier').attr('data-url');
            const baseUrlMatch = modalHtml.match(/var\s+url\s*=\s*['"](https?:\/\/[^'"]+id=)['"]/i);
            
            if (fileApiUrl && baseUrlMatch && baseUrlMatch[1]) {
              const fileApiFullUrl = fileApiUrl.startsWith('http') ? fileApiUrl : new URL(fileApiUrl, urlObj.origin).toString();
              const downloadBaseUrl = baseUrlMatch[1];
              this.logger.info({ fileApiFullUrl, downloadBaseUrl }, 'Found dynamic file API in BekSummaryModal');
              
              try {
                const fileListJson = await this.httpClient.getText(fileApiFullUrl, { timeout: 15000 });
                const files = JSON.parse(fileListJson);
                for (const file of files) {
                  if (file.DokIDStr && file.TFilename) {
                    modalDocLinks.push({
                      url: downloadBaseUrl + file.DokIDStr,
                      filename: file.TFilename
                    });
                  }
                }
              } catch (apiErr: any) {
                this.logger.warn({ error: apiErr.message }, 'Failed to fetch dynamic file list from BekSummaryModal API');
              }
            }

            // Fallback to static a[href] parsing if no dynamic API or as a supplement
            $modal('a[href]').each((_i, el) => {
              const href = $modal(el).attr('href');
              if (!href) return;
              let cleanHref = href;
              const semiIdx = cleanHref.indexOf(';');
              if (semiIdx !== -1) cleanHref = cleanHref.substring(0, semiIdx);
              const ext = path.extname(cleanHref).toLowerCase();
              if (DOC_EXTENSIONS.has(ext)) {
                const absoluteUrl = href.startsWith('http') ? href : new URL(href, urlObj.origin).toString();
                modalDocLinks.push({ url: absoluteUrl, filename: $modal(el).text().trim() || undefined });
              }
            });

            if (modalDocLinks.length > 0) {
              this.logger.info({ count: modalDocLinks.length }, 'Found document links in BekSummaryModal');
              const results: DownloadResult = { downloaded: [], failed: [], skipped: [] };
              for (const link of modalDocLinks) {
                const filePath = await this.downloadFile(link.url, destDir, link.filename);
                if (filePath) results.downloaded.push(filePath);
                else results.failed.push(link.url);
              }
              if (results.downloaded.length > 0) return results;
            } else {
              this.logger.info('No direct file links in BekSummaryModal HTML; will try Playwright');
            }
          }
        }
      } catch (modalErr: any) {
        this.logger.warn({ error: modalErr.message }, 'BekSummaryModal API call failed');
      }

      // Last resort: Playwright — click the info icon, wait for modal, extract document links
      this.logger.info({ pageUrl }, 'Cosinex: trying Playwright to click info icon and extract docs from modal');
      let context: any;
      try {
        const result = await this.browserPool.acquirePage(pageUrl);
        context = result.context;
        const page = result.page;

        // Wait for the DevExtreme grid to render
        await page.waitForTimeout(6000);

        // Click the "i" info icon (.BekSummary) in the grid
        const infoIcon = '.BekSummary';
        if (await page.locator(infoIcon).count() > 0) {
          this.logger.info('Found BekSummary info icon; clicking to open modal');
          await page.locator(infoIcon).first().click();
          await page.waitForTimeout(4000);

          // Wait for the modal to appear
          try {
            await page.waitForSelector('#BekSummaryModal.in, #BekSummaryModal.show, .modal.in, .modal.show', { timeout: 8000 });
          } catch { /* modal might have a different structure */ }

          // Scan modal content for download links
          const modalHtml = await page.content();
          const $m = cheerio.load(modalHtml);
          const pwDocLinks: { url: string; filename?: string }[] = [];
          const seenPw = new Set<string>();

          $m('#BekSummaryModal a[href], .modal a[href]').each((_i, el) => {
            const href = $m(el).attr('href');
            if (!href) return;
            let cleanHref = href;
            const semiIdx = cleanHref.indexOf(';');
            if (semiIdx !== -1) cleanHref = cleanHref.substring(0, semiIdx);
            const ext = path.extname(cleanHref).toLowerCase();
            if (DOC_EXTENSIONS.has(ext)) {
              try {
                const absoluteUrl = new URL(href, pageUrl).toString();
                if (!seenPw.has(absoluteUrl)) {
                  seenPw.add(absoluteUrl);
                  pwDocLinks.push({ url: absoluteUrl, filename: $m(el).text().trim() || undefined });
                }
              } catch { /* skip */ }
            }
          });

          if (pwDocLinks.length > 0) {
            this.logger.info({ count: pwDocLinks.length }, 'Found document links in Playwright-rendered Cosinex modal');
            return this.downloadAllDocuments(pwDocLinks, destDir);
          }

          // Also try clicking any download button inside the modal
          const modalDownloadBtn = '#BekSummaryModal a[href*=".zip"], #BekSummaryModal a[href*=".pdf"], .modal a[href*=".zip"], .modal a[download]';
          if (await page.locator(modalDownloadBtn).count() > 0) {
            try {
              const [downloadEvent] = await Promise.all([
                page.waitForEvent('download', { timeout: 15000 }),
                page.locator(modalDownloadBtn).first().click(),
              ]);
              const savePath = path.join(destDir, downloadEvent.suggestedFilename());
              await downloadEvent.saveAs(savePath);
              return { downloaded: [savePath], failed: [], skipped: [] };
            } catch { /* download event not triggered */ }
          }
        }
      } catch (pwErr: any) {
        this.logger.warn({ error: pwErr.message }, 'Playwright Cosinex modal approach failed');
      } finally {
        if (context) await this.browserPool.cleanupContext(context);
      }

      this.logger.warn({ pageUrl }, 'All Cosinex download strategies exhausted');
      return { downloaded: [], failed: [pageUrl], skipped: [] };
    }

    // Special handling for evergabe.de (Vergabemarktplatz)
    if (host.includes('evergabe.de') && !host.includes('deutsche-evergabe.de')) {
      // Fast-path: most OCDS links end with /zustellweg-auswaehlen, while the actual
      // public documents table is available directly at /unterlagen/<id>.
      const canonicalDocsUrl = pageUrl.replace(/\/zustellweg-auswaehlen\/?$/i, '');

      if (canonicalDocsUrl !== pageUrl) {
        this.logger.info({ pageUrl, canonicalDocsUrl }, 'evergabe.de: trying canonical documents page first');
        try {
          const canonicalHtml = await this.httpClient.getText(canonicalDocsUrl, {
            ...options,
            timeout: options.timeout ?? 20000,
          });
          const $canon = cheerio.load(canonicalHtml);
          const refs: DocumentRef[] = [];
          const seenCanon = new Set<string>();

          $canon('a[href*="/download-url/"], a[href*="/portal/files/download"]').each((_i, el) => {
            const href = $canon(el).attr('href');
            if (!href) return;
            try {
              const absoluteUrl = new URL(href, canonicalDocsUrl).toString();
              if (seenCanon.has(absoluteUrl)) return;
              seenCanon.add(absoluteUrl);

              const rowText = $canon(el).closest('tr').text();
              const filenameMatch = rowText.match(/([^\s\\/:*?"<>|]+\.(?:pdf|zip|docx?|xlsx?|pptx?|xml|csv|txt|rtf))/i);
              refs.push({
                url: absoluteUrl,
                filename: filenameMatch ? filenameMatch[1] : undefined,
              });
            } catch {
              // Skip invalid absolute URL resolution
            }
          });

          if (refs.length > 0) {
            this.logger.info({ count: refs.length, canonicalDocsUrl }, 'evergabe.de: found download-url links on canonical page');
            return this.downloadAllDocuments(refs, destDir, options);
          }
        } catch (canonErr: any) {
          this.logger.debug({ error: canonErr.message }, 'evergabe.de canonical-page extraction failed; falling back to Playwright');
        }
      }

      this.logger.info({ pageUrl }, 'Handling evergabe.de portal via Playwright');
      let context: any;
      try {
        const result = await this.browserPool.acquirePage(pageUrl);
        context = result.context;
        const page = result.page;

        this.logger.info('Handling evergabe.de access/download flow');
        // Wait for page to fully render
        await page.waitForTimeout(4000);
        await this.dismissKnownCookieOverlays(page);

        // If we are on the "zustellweg-auswaehlen" page, click the actionable
        // "Vergabeunterlagen ansehen" button/link (not just the heading text).
        try {
          const anonymousAccessSelectors = [
            'a.btn.btn-primary[href*="/unterlagen/"]:has-text("Vergabeunterlagen ansehen")',
            'a[href*="/unterlagen/"]:has-text("Vergabeunterlagen ansehen")',
            'a:has-text("Vergabeunterlagen ansehen")',
          ];

          for (const selector of anonymousAccessSelectors) {
            if (await page.locator(selector).count() > 0) {
              this.logger.info({ selector }, 'evergabe.de: opening anonymous documents page');
              await page.locator(selector).last().click({ timeout: 10000 });
              await page.waitForTimeout(3500);
              await this.dismissKnownCookieOverlays(page);
              break;
            }
          }
        } catch (flowErr: any) {
          this.logger.debug({ error: flowErr.message }, 'evergabe.de: could not click anonymous access button');
        }

        // Step 3: Click the download button which initiates the file download
        const downloadSelectors = [
          'button:has-text("herunterladen")',
          'button:has-text("Herunterladen")',
          'a:has-text("Herunterladen")',
          'a:has-text("Download")',
          'button:has-text("Download")',
          'a[href*=".zip"]',
          'a[href*=".pdf"]',
          'a[download]',
        ];

        for (const selector of downloadSelectors) {
          try {
            if (await page.locator(selector).count() > 0) {
              this.logger.info({ selector }, 'Found download element; attempting download');
              try {
                const [downloadEvent] = await Promise.all([
                  page.waitForEvent('download', { timeout: 20000 }),
                  page.locator(selector).first().click(),
                ]);
                const suggestedFilename = downloadEvent.suggestedFilename();
                const savePath = path.join(destDir, suggestedFilename);
                this.logger.info({ savePath }, 'Playwright captured download successfully');
                await downloadEvent.saveAs(savePath);
                return { downloaded: [savePath], failed: [], skipped: [] };
              } catch (dlErr: any) {
                // The click didn't trigger a download event; maybe it's a direct navigation
                this.logger.debug({ selector, error: dlErr.message }, 'Download event not triggered; trying direct href');
              }
            }
          } catch { /* try next selector */ }
        }

        // Fallback: scan the rendered page for direct file links
        const dynamicHtml = await page.content();
        const $ev = cheerio.load(dynamicHtml);
        const evRefs: DocumentRef[] = [];
        const evSeen = new Set<string>();

        $ev('a[href]').each((_i, el) => {
          const href = $ev(el).attr('href');
          if (!href) return;

          let cleanHref = href;
          const semiIdx = cleanHref.indexOf(';');
          if (semiIdx !== -1) cleanHref = cleanHref.substring(0, semiIdx);

          const ext = path.extname(cleanHref).toLowerCase();
          const hrefLower = cleanHref.toLowerCase();
          const isEvergabeDownloadUrl =
            hrefLower.includes('/download-url/') ||
            hrefLower.includes('/portal/files/download');

          if (DOC_EXTENSIONS.has(ext) || isEvergabeDownloadUrl) {
            try {
              const absoluteUrl = new URL(href, page.url()).toString();
              if (!evSeen.has(absoluteUrl)) {
                evSeen.add(absoluteUrl);

                // Try to infer filename from row text (evergabe table lists filename in the same row)
                let inferredFilename: string | undefined;
                const rowText = $ev(el).closest('tr').text();
                const filenameMatch = rowText.match(/([^\s\\/:*?"<>|]+\.(?:pdf|zip|docx?|xlsx?|pptx?|xml|csv|txt|rtf))/i);
                if (filenameMatch) {
                  inferredFilename = filenameMatch[1];
                }

                evRefs.push({
                  url: absoluteUrl,
                  filename: inferredFilename || $ev(el).text().trim() || undefined,
                });
              }
            } catch {
              // skip invalid URLs
            }
          }
        });

        if (evRefs.length > 0) {
          this.logger.info({ count: evRefs.length }, 'Found document links in rendered evergabe.de page');
          return this.downloadAllDocuments(evRefs, destDir, options);
        }
      } catch (err: any) {
        this.logger.warn({ error: err.message }, 'Failed during evergabe.de Playwright handling');
      } finally {
        if (context) {
          await this.browserPool.cleanupContext(context);
        }
      }
      this.logger.warn({ pageUrl }, 'evergabe.de download failed. Returning failure.');
      return { downloaded: [], failed: [pageUrl], skipped: [] };
    }

    // Special handling for NetServer portals (vergabekooperation.berlin, etc.)
    if (
      pageUrl.includes('NetServer') ||
      pageUrl.includes('TenderingProcedureDetails') ||
      host.includes('vergabekooperation')
    ) {
      this.logger.info({ pageUrl }, 'Handling NetServer portal via Playwright');
      return this.playwrightDownloadFallback(pageUrl, destDir);
    }

    // --- GENERAL HTML PARSING FALLBACK ---
    this.logger.info({ pageUrl }, 'Fetching page to discover document download links via static HTML');

    let htmlContent: string | null = null;
    try {
      htmlContent = await this.httpClient.getText(pageUrl, {
        ...options,
        timeout: options.timeout ?? 15000,
      });
    } catch (error: any) {
      this.logger.warn({ pageUrl, error: error.message }, 'Failed to fetch documents page via HttpClient; will try Playwright browser');
    }

    let documentRefs: DocumentRef[] = [];
    const seenUrls = new Set<string>();

    // Helper to evaluate and add a document reference
    const addDocumentRef = (href: string, titleText?: string) => {
      let absoluteUrl: string;
      try {
        absoluteUrl = new URL(href, pageUrl).toString();
      } catch {
        return;
      }

      if (seenUrls.has(absoluteUrl)) return;

      let cleanPathname = new URL(absoluteUrl).pathname;
      const semiColonIndex = cleanPathname.indexOf(';');
      if (semiColonIndex !== -1) {
        cleanPathname = cleanPathname.substring(0, semiColonIndex);
      }

      const ext = path.extname(cleanPathname).toLowerCase();
      const lowerAbsolute = absoluteUrl.toLowerCase();
      const looksLikeNonExtDownload =
        lowerAbsolute.includes('/download-url/') ||
        lowerAbsolute.includes('/portal/files/download') ||
        lowerAbsolute.includes('function=_download') ||
        lowerAbsolute.includes('/download?') ||
        lowerAbsolute.includes('downloadtoken=');

      if (DOC_EXTENSIONS.has(ext) || looksLikeNonExtDownload) {
        seenUrls.add(absoluteUrl);
        let linkText = titleText?.trim();
        // Ignore generic download buttons or text that don't represent actual file names
        if (linkText) {
          const lowerText = linkText.toLowerCase();
          if (
            lowerText === 'die datei herunterladen' ||
            lowerText === 'download' ||
            lowerText === 'herunterladen' ||
            lowerText === 'dokument herunterladen' ||
            lowerText.startsWith('hier clicken') ||
            lowerText.startsWith('please click')
          ) {
            linkText = undefined;
          }
        }
        documentRefs.push({
          url: absoluteUrl,
          filename: linkText && linkText.length < 200
            ? `${linkText}${ext.startsWith('.') ? '' : ext}`
            : undefined,
        });
      }
    };

    if (htmlContent) {
      const $ = cheerio.load(htmlContent);
      // Find all anchor tags that link to downloadable files
      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (href) addDocumentRef(href, $(el).text());
      });

      // Also check for download links in common patterns
      $('[data-href], [data-url], [data-download-url]').each((_i, el) => {
        const href = $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-download-url');
        if (href) addDocumentRef(href);
      });

      // Scan onclick attributes
      $('[onclick]').each((_i, el) => {
        const onclick = $(el).attr('onclick');
        if (!onclick) return;
        const regex = /['"]([^'"]+?\.(?:pdf|zip|docx?|xlsx?|pptx?|odt|ods|csv|xml|rar|7z|tar|gz|rtf|txt)(?:;[^'"]*)?)['"]$/gi;
        let match;
        while ((match = regex.exec(onclick)) !== null) {
          const href = match[1];
          addDocumentRef(href, $(el).attr('title') || $(el).text());
        }
      });
    }

    if (documentRefs.length === 0) {
      this.logger.info({ pageUrl }, 'No documents found via static HTML; launching Playwright to render dynamically');
      return this.playwrightDownloadFallback(pageUrl, destDir);
    }

    this.logger.info(
      { pageUrl, documentCount: documentRefs.length },
      'Discovered document links on page; starting downloads',
    );

    return this.downloadAllDocuments(documentRefs, destDir, options);
  }

  /**
   * bi-medien specific handling.
   * The detail URL often needs one additional click to open the documents tab.
   */
  private async handleBiMedienDocumentsPage(
    pageUrl: string,
    destDir: string,
    options: RequestOptions = {},
  ): Promise<DownloadResult> {
    this.logger.info({ pageUrl }, 'Handling bi-medien portal via Playwright (documents tab flow)');

    let context: any;
    try {
      const result = await this.browserPool.acquirePage(pageUrl);
      context = result.context;
      const page = result.page;

      await page.waitForTimeout(3500);
      await this.dismissKnownCookieOverlays(page);

      const tabSelectors = [
        'a:has-text("Dokumente")',
        'a:has-text("Unterlagen")',
        'a:has-text("Vergabeunterlagen")',
        'button:has-text("Dokumente")',
        'button:has-text("Unterlagen")',
        '[role="tab"]:has-text("Dokumente")',
        '[role="tab"]:has-text("Unterlagen")',
      ];

      for (const selector of tabSelectors) {
        try {
          if (await page.locator(selector).count() > 0) {
            this.logger.info({ selector, pageUrl }, 'bi-medien: opening documents tab');
            await page.locator(selector).first().click({ timeout: 8000 });
            await page.waitForTimeout(2500);
            break;
          }
        } catch {
          // try next selector
        }
      }

      // First try direct download clicks that emit a browser download event.
      const downloadSelectors = [
        'a[href*="download"]',
        'a[href*="/file/"]',
        'a[href$=".pdf"]',
        'a[href$=".zip"]',
        'a[href$=".doc"]',
        'a[href$=".docx"]',
        'a[href$=".xls"]',
        'a[href$=".xlsx"]',
        'a:has-text("Download")',
        'a:has-text("Herunterladen")',
        'button:has-text("Download")',
        'button:has-text("Herunterladen")',
      ];

      for (const selector of downloadSelectors) {
        try {
          if (await page.locator(selector).count() > 0) {
            this.logger.info({ selector, pageUrl }, 'bi-medien: attempting direct download click');
            try {
              const [downloadEvent] = await Promise.all([
                page.waitForEvent('download', { timeout: 12000 }),
                page.locator(selector).first().click(),
              ]);
              const savePath = path.join(destDir, downloadEvent.suggestedFilename());
              await downloadEvent.saveAs(savePath);
              return { downloaded: [savePath], failed: [], skipped: [] };
            } catch {
              // click did not trigger a browser download event; continue to DOM extraction
            }
          }
        } catch {
          // try next selector
        }
      }

      // Fallback: collect all downloadable links from rendered DOM after tab click.
      const html = await page.content();
      const $ = cheerio.load(html);
      const refs: DocumentRef[] = [];
      const seen = new Set<string>();

      $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        try {
          const absoluteUrl = new URL(href, page.url()).toString();
          if (seen.has(absoluteUrl)) return;

          let cleanPath = new URL(absoluteUrl).pathname;
          const semiIdx = cleanPath.indexOf(';');
          if (semiIdx !== -1) cleanPath = cleanPath.substring(0, semiIdx);

          const ext = path.extname(cleanPath).toLowerCase();
          const lower = absoluteUrl.toLowerCase();
          const looksLikeDownload =
            DOC_EXTENSIONS.has(ext) ||
            lower.includes('/download') ||
            lower.includes('downloadtoken=') ||
            lower.includes('fileid=');

          if (!looksLikeDownload) return;

          seen.add(absoluteUrl);
          refs.push({
            url: absoluteUrl,
            filename: $(el).text().trim() || undefined,
          });
        } catch {
          // ignore invalid URLs
        }
      });

      if (refs.length > 0) {
        this.logger.info({ pageUrl, count: refs.length }, 'bi-medien: found document links after opening tab');
        return this.downloadAllDocuments(refs, destDir, options);
      }
    } catch (error: any) {
      this.logger.warn({ pageUrl, error: error.message }, 'bi-medien documents tab flow failed; using generic fallback');
    } finally {
      if (context) {
        await this.browserPool.cleanupContext(context);
      }
    }

    return this.playwrightDownloadFallback(pageUrl, destDir);
  }

  /**
   * Dismiss common cookie overlays that block clicks on many EU procurement portals.
   */
  private async dismissKnownCookieOverlays(page: any): Promise<void> {
    const consentButtons = [
      'button:has-text("Alle akzeptieren")',
      'button:has-text("Akzeptieren")',
      'button:has-text("Ich stimme zu")',
      'button:has-text("Accept all")',
      'button:has-text("Accept")',
      '[aria-label*="accept" i]',
    ];

    for (const selector of consentButtons) {
      try {
        if (await page.locator(selector).count() > 0) {
          await page.locator(selector).first().click({ timeout: 2000 });
          await page.waitForTimeout(500);
          break;
        }
      } catch {
        // Continue trying other selectors
      }
    }

    // Last resort: remove known overlay roots that intercept clicks.
    try {
      await page.evaluate(() => {
        const selectors = [
          '#usercentrics-root',
          '#usercentrics-cmp-ui',
          '.uc-embedding-container',
          '.cookie-banner',
          '.cookie-consent',
          '.cmpbox',
        ];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el) => {
            (el as HTMLElement).style.pointerEvents = 'none';
            (el as HTMLElement).style.display = 'none';
          });
        }
      });
    } catch {
      // Ignore DOM manipulation errors
    }
  }

  /**
   * Playwright-based fallback for downloading documents from JS-rendered pages.
   * Used for NetServer portals and as a last resort for other portals.
   */
  private async playwrightDownloadFallback(
    pageUrl: string,
    destDir: string,
  ): Promise<DownloadResult> {
    let context: any;
    try {
      const result = await this.browserPool.acquirePage(pageUrl);
      context = result.context;
      const page = result.page;

      // Let dynamic content load
      await page.waitForTimeout(5000);
      await this.dismissKnownCookieOverlays(page);

      // Try clicking any download/zip buttons first
      const downloadBtnSelectors = [
        'a[href*=".zip"]',
        'a[href*=".pdf"]',
        'a[href*="/download-url/"]',
        'a[href*="/download"]',
        'button:has-text("Download")',
        'button:has-text("download")',
        'button:has-text("Herunterladen")',
        'a:has-text("Vergabeunterlagen")',
        'a:has-text("Vergabeunterlagen ansehen")',
        'a:has-text("Datei herunterladen")',
        'a:has-text("ZIP")',
        'a[download]',
      ];

      for (const selector of downloadBtnSelectors) {
        try {
          if (await page.locator(selector).count() > 0) {
            this.logger.info({ selector, pageUrl }, 'Playwright found download element; attempting download');
            try {
              const [downloadEvent] = await Promise.all([
                page.waitForEvent('download', { timeout: 15000 }),
                page.locator(selector).first().click(),
              ]);
              const suggestedFilename = downloadEvent.suggestedFilename();
              const savePath = path.join(destDir, suggestedFilename);
              this.logger.info({ savePath }, 'Playwright captured download successfully');
              await downloadEvent.saveAs(savePath);
              return { downloaded: [savePath], failed: [], skipped: [] };
            } catch {
              this.logger.debug({ selector }, 'Download event not triggered by button click');
            }
          }
        } catch { /* try next selector */ }
      }

      // Scan rendered DOM for direct file links
      const dynamicHtml = await page.content();
      const $dynamic = cheerio.load(dynamicHtml);
      const refs: DocumentRef[] = [];
      const seen = new Set<string>();

      $dynamic('a[href]').each((_i, el) => {
        const href = $dynamic(el).attr('href');
        if (!href) return;
        let cleanHref = href;
        const semiIdx = cleanHref.indexOf(';');
        if (semiIdx !== -1) cleanHref = cleanHref.substring(0, semiIdx);
        const ext = path.extname(cleanHref).toLowerCase();
        const hrefLower = cleanHref.toLowerCase();
        const looksLikeNonExtDownload =
          hrefLower.includes('/download-url/') ||
          hrefLower.includes('/portal/files/download') ||
          hrefLower.includes('function=_download') ||
          hrefLower.includes('/download?');

        if (DOC_EXTENSIONS.has(ext) || looksLikeNonExtDownload) {
          try {
            const absoluteUrl = new URL(href, page.url()).toString();
            if (!seen.has(absoluteUrl)) {
              seen.add(absoluteUrl);
              refs.push({ url: absoluteUrl, filename: $dynamic(el).text().trim() || undefined });
            }
          } catch { /* skip */ }
        }
      });

      if (refs.length > 0) {
        this.logger.info({ count: refs.length, pageUrl }, 'Found document links in Playwright-rendered page');
        return this.downloadAllDocuments(refs, destDir);
      }
    } catch (err: any) {
      this.logger.error({ pageUrl, error: err.message }, 'Playwright fallback encountered error');
    } finally {
      if (context) {
        await this.browserPool.cleanupContext(context);
      }
    }

    this.logger.warn({ pageUrl }, 'No downloadable document links found on page (static or dynamic)');
    return { downloaded: [], failed: [pageUrl], skipped: [] };
  }
}
