import { Controller, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('scrapers')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('run')
  async runScrapers() {
    return await this.appService.triggerScrapeCycle();
  }
}
