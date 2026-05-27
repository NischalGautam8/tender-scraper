import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerToken } from 'nestjs-pino';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: getLoggerToken(AppService.name),
          useValue: mockLogger,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('run', () => {
    it('should trigger scraping cycle and return success status', async () => {
      const result = await appController.runScrapers();
      expect(result.status).toBe('success');
      expect(result.message).toContain('Sprint 1 skeleton');
    });
  });
});
