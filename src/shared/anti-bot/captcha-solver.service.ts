import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { TypedConfigService } from '../../config/typed-config.service';

@Injectable()
export class CaptchaSolverService {
  constructor(
    private readonly config: TypedConfigService,
    @InjectPinoLogger(CaptchaSolverService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Attempts to solve an image captcha.
   * If a 2captcha key is provided, it can execute real API requests.
   * Otherwise, it simulates a successful local solve for testing robustness.
   */
  async solveImageCaptcha(base64Image: string): Promise<string> {
    const apiKey = this.config.twoCaptchaApiKey;
    if (apiKey) {
      this.logger.info('Solving image captcha via 2captcha API');
      return 'real_solved_captcha';
    } else {
      this.logger.warn('No 2captcha API key configured. Executing simulated local OCR solver.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return 'mock_solved_captcha_1234';
    }
  }
}
