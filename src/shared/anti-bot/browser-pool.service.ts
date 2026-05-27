import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { TypedConfigService } from '../../config/typed-config.service';

@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private browser: Browser | null = null;

  constructor(
    private readonly config: TypedConfigService,
    @InjectPinoLogger(BrowserPoolService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Acquire a clean browser page, initializing the browser if needed.
   */
  async acquirePage(url?: string): Promise<{ context: BrowserContext; page: Page }> {
    if (!this.browser) {
      this.logger.info('Launching Chromium browser instance');
      this.browser = await chromium.launch({
        headless: this.config.isPlaywrightHeadless,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ],
      });
    }

    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE,de;q=0.9',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });

    // Humanize page execution context by mocking navigator.webdriver to undefined
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    const page = await context.newPage();
    if (url) {
      this.logger.info({ url }, 'Navigating browser to page');
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    return { context, page };
  }

  async cleanupContext(context: BrowserContext): Promise<void> {
    try {
      await context.close();
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to close browser context');
    }
  }

  async onModuleDestroy() {
    if (this.browser) {
      this.logger.info('Closing Chromium browser pool');
      await this.browser.close();
      this.browser = null;
    }
  }
}
