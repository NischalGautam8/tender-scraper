import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { DiscoveredTender } from './oev-api.types';

@Injectable()
export class SubPortalDispatcherService {
  constructor(
    private readonly moduleRef: ModuleRef,
    @InjectPinoLogger(SubPortalDispatcherService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Dispatches a discovered tender to its matching sub-portal service.
   * If the service is not yet loaded in the context, it logs a warning and skips.
   */
  async dispatch(tender: DiscoveredTender): Promise<void> {
    const serviceToken = this.getServiceToken(tender.subPortalModule);
    if (!serviceToken) {
      this.logger.warn({ tenderId: tender.id, moduleName: tender.subPortalModule }, 'No mapping service registered for module');
      return;
    }

    try {
      const service = this.moduleRef.get(serviceToken, { strict: false });
      if (service && typeof service.processDiscoveredTender === 'function') {
        this.logger.info({ tenderId: tender.id, moduleName: tender.subPortalModule }, 'Dispatching discovered tender to handler service');
        await service.processDiscoveredTender(tender);
      } else {
        this.logger.warn({ tenderId: tender.id, moduleName: tender.subPortalModule }, 'Handler service registered but missing processDiscoveredTender method');
      }
    } catch (error: any) {
      this.logger.warn(
        { tenderId: tender.id, moduleName: tender.subPortalModule, error: error.message },
        'Handler service not active or not loaded in current sprint container, skipping dispatch',
      );
    }
  }

  /**
   * Helper mapping sub-portal names to their corresponding NestJS Service token string.
   * Using string tokens prevents compile-time circular imports between OevDiscoveryModule
   * and the individual sub-portal modules.
   */
  private getServiceToken(moduleName: string): string | null {
    const registry: Record<string, string> = {
      'bi-medien': 'BiMedienService',
      'evergabe-de': 'EvergabeDeService',
      'fbhh-hamburg': 'FbhhHamburgService',
      'dtvp': 'DtvpService',
      'deutsche-evergabe': 'DeutscheEvergabeService',
      'hamburg-wasser': 'HamburgWasserService',
      'charite-berlin': 'ChariteBerlinService',
      'vergabekooperation-berlin': 'VergabekooperationBerlinService',
      'sachsen-evergabe': 'SachsenEvergabeService',
    };
    
    return registry[moduleName] ?? null;
  }
}
