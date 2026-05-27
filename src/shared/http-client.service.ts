import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { TypedConfigService } from '../config/typed-config.service';
import { RateLimiter } from './rate-limiter';
import * as stream from 'stream';
import * as fs from 'fs';
import { promisify } from 'util';

const finished = promisify(stream.finished);

export interface RequestOptions {
  headers?: Record<string, string>;
  cookies?: string;
  maxRetries?: number;
  rateLimitRpm?: number;
  timeout?: number;
  followRedirects?: boolean;
}

@Injectable()
export class HttpClientService {
  private readonly limiters = new Map<string, RateLimiter>();
  private readonly defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor(
    private readonly config: TypedConfigService,
    @InjectPinoLogger(HttpClientService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Acquire a rate limiter instance for a specific host.
   */
  private getRateLimiter(host: string, rpmOverride?: number): RateLimiter {
    const rpm = rpmOverride ?? this.config.defaultRateLimitRpm;
    let limiter = this.limiters.get(host);
    if (!limiter) {
      limiter = new RateLimiter(rpm, 5);
      this.limiters.set(host, limiter);
    }
    return limiter;
  }

  /**
   * Builds an Axios instance pre-configured with proxy, timeouts, etc.
   */
  private createAxiosInstance(options: RequestOptions): AxiosInstance {
    const config: AxiosRequestConfig = {
      timeout: options.timeout ?? 30000,
      maxRedirects: options.followRedirects === false ? 0 : 5,
      validateStatus: (status) => status >= 200 && status < 400,
    };

    // Wire up proxy if configured
    const proxyUrl = this.config.proxyUrl;
    if (proxyUrl) {
      const agent = new HttpsProxyAgent(proxyUrl);
      config.httpsAgent = agent;
      config.httpAgent = agent;
      config.proxy = false; // Disable default Axios proxy handling when using Agent
    }

    return axios.create(config);
  }

  /**
   * Prepare headers and cookies
   */
  private prepareHeaders(url: string, options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': this.defaultUserAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      Referer: new URL(url).origin,
      ...options.headers,
    };

    if (options.cookies) {
      headers['Cookie'] = options.cookies;
    }

    return headers;
  }

  /**
   * Execute an HTTP request with automatic rate limiting and exponential retries.
   */
  private async executeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
    options: RequestOptions = {},
    responseType: 'json' | 'text' | 'stream' = 'json',
  ): Promise<AxiosResponse<T>> {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    
    // Acquire rate limit slot
    const limiter = this.getRateLimiter(host, options.rateLimitRpm);
    await limiter.acquire();

    const axiosInstance = this.createAxiosInstance(options);
    const headers = this.prepareHeaders(url, options);

    const maxRetries = options.maxRetries ?? 3;
    let attempt = 0;
    let delay = 1000; // start with 1s

    while (true) {
      attempt++;
      try {
        this.logger.debug({ method, url, attempt, maxRetries }, 'Sending HTTP request');
        
        const response = await axiosInstance.request<T>({
          method,
          url,
          data: body,
          headers,
          responseType: responseType as any,
        });

        return response;
      } catch (error: any) {
        const status = error.response?.status;
        const isRetryable =
          !status || // Network errors
          status === 429 ||
          status >= 500;

        if (attempt <= maxRetries && isRetryable) {
          this.logger.warn(
            {
              method,
              url,
              attempt,
              status,
              errorMessage: error.message,
              nextAttemptDelayMs: delay,
            },
            'HTTP request failed; retrying with backoff',
          );
          
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // exponential backoff
        } else {
          this.logger.error(
            {
              method,
              url,
              attempt,
              status,
              errorMessage: error.message,
            },
            'HTTP request failed permanently',
          );
          throw error;
        }
      }
    }
  }

  async get<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.executeRequest<T>('GET', url, undefined, options, 'json');
    return response.data;
  }

  async getText(url: string, options: RequestOptions = {}): Promise<string> {
    const response = await this.executeRequest<string>('GET', url, undefined, options, 'text');
    return response.data;
  }

  async post<T>(url: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    const response = await this.executeRequest<T>('POST', url, body, options, 'json');
    return response.data;
  }

  /**
   * Streams a file download directly to a filesystem path.
   */
  async downloadStream(url: string, destPath: string, options: RequestOptions = {}): Promise<void> {
    const response = await this.executeRequest<stream.Readable>('GET', url, undefined, options, 'stream');
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    await finished(writer);
  }
}
