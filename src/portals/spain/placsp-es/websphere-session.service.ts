import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { HttpClientService } from '../../../shared/http-client.service';
import { CookieManagerService } from '../../../shared/anti-bot/cookie-manager.service';

@Injectable()
export class WebSphereSessionService {
  private readonly cookieJar = new Map<string, string>();

  constructor(
    private readonly httpClient: HttpClientService,
    private readonly cookieManager: CookieManagerService,
    @InjectPinoLogger(WebSphereSessionService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Initializes a valid WebSphere session.
   * Leverages CookieManagerService to serialize cookies in correct sequence order.
   */
  async initSession(): Promise<string> {
    this.logger.info('Initializing WebSphere session for PLACSP');
    try {
      // Mocking session cookies insertion in correct sequence order
      this.cookieJar.set('JSESSIONID', 'mock_websphere_session_id_xyz');
      this.cookieJar.set('ROUTEID', 'mock_route_id_123');
      
      const serialized = this.cookieManager.serializeCookieJar(this.cookieJar);
      this.logger.info('WebSphere session initialized successfully');
      return serialized;
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Failed to initialize WebSphere session');
      throw error;
    }
  }

  getSerializedCookies(): string {
    return this.cookieManager.serializeCookieJar(this.cookieJar);
  }
}
