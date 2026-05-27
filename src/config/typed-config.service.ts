import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvType } from './env.schema';

@Injectable()
export class TypedConfigService {
  constructor(private readonly config: ConfigService<EnvType, true>) {}

  get nodeEnv(): string {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get outputDir(): string {
    return this.config.get('OUTPUT_DIR', { infer: true });
  }

  get logLevel(): string {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get defaultRateLimitRpm(): number {
    return this.config.get('DEFAULT_RATE_LIMIT_RPM', { infer: true });
  }

  get isPlaywrightHeadless(): boolean {
    return this.config.get('PLAYWRIGHT_HEADLESS', { infer: true });
  }

  get twoCaptchaApiKey(): string | undefined {
    return this.config.get('TWO_CAPTCHA_API_KEY', { infer: true });
  }

  get proxyUrl(): string | undefined {
    return this.config.get('PROXY_URL', { infer: true });
  }

  get listingCron(): string {
    return this.config.get('LISTING_CRON', { infer: true });
  }

  get documentCron(): string {
    return this.config.get('DOCUMENT_CRON', { infer: true });
  }
}
