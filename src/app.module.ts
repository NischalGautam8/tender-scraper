import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { TypedConfigService } from './config/typed-config.service';
import { SharedModule } from './shared/shared.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiscoveryModule } from './discovery/discovery.module';
import { BiMedienModule } from './portals/germany/bi-medien/bi-medien.module';
import { EvergabeDeModule } from './portals/germany/evergabe-de/evergabe-de.module';
import { FbhhHamburgModule } from './portals/germany/fbhh-hamburg/fbhh-hamburg.module';
import { HamburgWasserModule } from './portals/germany/netserver/hamburg-wasser/hamburg-wasser.module';
import { VergabekooperationBerlinModule } from './portals/germany/netserver/vergabekooperation-berlin/vergabekooperation-berlin.module';
import { SachsenEvergabeModule } from './portals/germany/netserver/sachsen-evergabe/sachsen-evergabe.module';
import { ChariteBerlinModule } from './portals/germany/netserver/charite-berlin/charite-berlin.module';
import { NetServerCron } from './portals/germany/netserver/netserver.cron';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [TypedConfigService],
      useFactory: (config: TypedConfigService) => {
        const isDev = config.nodeEnv !== 'production';
        return {
          pinoHttp: {
            level: config.logLevel,
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                  },
                }
              : undefined,
          },
        };
      },
    }),
    ScheduleModule.forRoot(),
    SharedModule,
    DiscoveryModule,
    BiMedienModule,
    EvergabeDeModule,
    FbhhHamburgModule,
    HamburgWasserModule,
    VergabekooperationBerlinModule,
    SachsenEvergabeModule,
    ChariteBerlinModule,
  ],
  controllers: [AppController],
  providers: [AppService, NetServerCron],
})
export class AppModule {}
