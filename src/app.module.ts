import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { TypedConfigService } from './config/typed-config.service';
import { SharedModule } from './shared/shared.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
