import { Module, Global } from '@nestjs/common';
import { BrowserPoolService } from './browser-pool.service';
import { CookieManagerService } from './cookie-manager.service';
import { CaptchaSolverService } from './captcha-solver.service';

@Global()
@Module({
  providers: [
    BrowserPoolService,
    CookieManagerService,
    CaptchaSolverService,
  ],
  exports: [
    BrowserPoolService,
    CookieManagerService,
    CaptchaSolverService,
  ],
})
export class AntiBotModule {}
