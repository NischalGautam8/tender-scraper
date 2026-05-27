import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getLoggerToken } from 'nestjs-pino';
import { DiscoveryService } from './discovery/discovery.service';
import { SubPortalDispatcherService } from './discovery/sub-portal-dispatcher.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const mockDiscoveryService = {
      discoverAll: jest.fn().mockResolvedValue([
        { id: '1', title: 'Tender 1', subPortalModule: 'bi-medien' },
        { id: '2', title: 'Tender 2', subPortalModule: 'evergabe-de' },
        { id: '3', title: 'Tender 3', subPortalModule: 'fbhh-hamburg' },
        { id: '4', title: 'Tender 4', subPortalModule: 'hamburg-wasser' },
        { id: '5', title: 'Tender 5', subPortalModule: 'vergabekooperation-berlin' },
        { id: '6', title: 'Tender 6', subPortalModule: 'sachsen-evergabe' },
        { id: '7', title: 'Tender 7', subPortalModule: 'charite-berlin' },
        { id: '8', title: 'Tender 8', subPortalModule: 'dtvp' },
        { id: '9', title: 'Tender 9', subPortalModule: 'deutsche-evergabe' },
      ]),
    };

    const mockDispatcher = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: getLoggerToken(AppService.name),
          useValue: mockLogger,
        },
        {
          provide: DiscoveryService,
          useValue: mockDiscoveryService,
        },
        {
          provide: SubPortalDispatcherService,
          useValue: mockDispatcher,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('run', () => {
    it('should trigger scraping cycle and return success status with count', async () => {
      const result = await appController.runScrapers();
      expect(result.status).toBe('success');
      expect(result.discoveredCount).toBe(9);
      expect(result.message).toContain('Discovered and processed 9 tenders');
    });
  });
});
