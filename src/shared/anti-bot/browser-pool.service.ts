import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { chromium, BrowserContext, Page } from 'playwright';
import { TypedConfigService } from '../../config/typed-config.service';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private persistentContext: BrowserContext | null = null;

  constructor(
    private readonly config: TypedConfigService,
    @InjectPinoLogger(BrowserPoolService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Acquire a clean browser page, initializing the persistent context if needed.
   * Uses persistent context to support browser extensions like NopeCHA.
   */
  async acquirePage(url?: string): Promise<{ context: BrowserContext; page: Page }> {
    if (!this.persistentContext) {
      const extensionPath = path.join(process.cwd(), 'nopecha_extension');
      const hasExtension = fs.existsSync(extensionPath);
      
      if (hasExtension) {
        this.logger.info('Launching persistent Chromium context with NopeCHA extension');
      } else {
        this.logger.info('Launching persistent Chromium context (NopeCHA extension not found)');
      }
      
      const userDataDir = path.join(process.cwd(), 'browser_data');

      const isHeadless = this.config.isPlaywrightHeadless;
      const args = [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ];

      if (hasExtension) {
        args.push(
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
        );
      }

      if (isHeadless) {
        args.push('--headless=new');
      }

      this.persistentContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Must be false to allow extensions. If headless is needed, --headless=new in args achieves it.
        args,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'de-DE,de;q=0.9',
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });

      // Humanize page execution context by mocking navigator.webdriver to undefined
      await this.persistentContext.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });
    }

    const page = await this.persistentContext.newPage();
    if (url) {
      this.logger.info({ url }, 'Navigating browser to page');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    return { context: this.persistentContext, page };
  }

  async cleanupPage(page: Page): Promise<void> {
    try {
      if (page && !page.isClosed()) {
        await page.close();
      }
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to close browser page');
    }
  }

  async onModuleDestroy() {
    if (this.persistentContext) {
      this.logger.info('Closing persistent Chromium context pool');
      await this.persistentContext.close();
      this.persistentContext = null;
    }
  }
}
