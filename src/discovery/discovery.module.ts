import { Module } from '@nestjs/common';
import { DiscoveryService } from './discovery.service';
import { SubPortalDispatcherService } from './sub-portal-dispatcher.service';
import { DiscoveryCron } from './discovery.cron';

@Module({
  providers: [
    DiscoveryService,
    SubPortalDispatcherService,
    DiscoveryCron,
  ],
  exports: [
    DiscoveryService,
    SubPortalDispatcherService,
  ],
})
export class DiscoveryModule {}
