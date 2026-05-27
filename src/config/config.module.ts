import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validate } from './env.schema';
import { TypedConfigService } from './typed-config.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
  ],
  providers: [TypedConfigService],
  exports: [TypedConfigService],
})
export class ConfigModule {}
