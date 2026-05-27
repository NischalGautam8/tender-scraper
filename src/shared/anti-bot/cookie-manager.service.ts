import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class CookieManagerService {
  constructor(
    @InjectPinoLogger(CookieManagerService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Parses Set-Cookie response headers and returns a map of cookies.
   */
  parseSetCookies(headers: string[]): Map<string, string> {
    const cookies = new Map<string, string>();
    if (!headers || !Array.isArray(headers)) return cookies;

    for (const header of headers) {
      const parts = header.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts[1].trim();
        cookies.set(name, value);
      }
    }
    return cookies;
  }

  /**
   * Combines an existing cookies map with new headers, preserving insertion order.
   * If a cookie already exists, it is updated in-place.
   */
  updateCookieJar(cookieJar: Map<string, string>, newHeaders: string[]): Map<string, string> {
    const newCookies = this.parseSetCookies(newHeaders);
    for (const [name, value] of newCookies.entries()) {
      cookieJar.set(name, value);
    }
    return cookieJar;
  }

  /**
   * Formats the cookies map into a single string for HTTP Request Cookie headers,
   * maintaining insertion order.
   */
  serializeCookieJar(cookieJar: Map<string, string>): string {
    return Array.from(cookieJar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}
