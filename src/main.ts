import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppService } from './app.service';

async function bootstrap() {
  const isRunOnce = process.argv.includes('--run-once');

  if (isRunOnce) {
    // Standalone context mode for CLI execution:
    // Boots the NestJS IOC container without starting the HTTP server
    const app = await NestFactory.createApplicationContext(AppModule, {
      bufferLogs: true,
    });

    const logger = app.get(Logger);
    app.useLogger(logger);
    app.flushLogs();

    const appService = app.get(AppService);
    logger.log('Booting in CLI mode: Run-Once scrape cycle starting...');

    try {
      await appService.triggerScrapeCycle();
      logger.log('CLI Mode: Run-Once scrape cycle finished successfully.');
      await app.close();
      process.exit(0);
    } catch (error: any) {
      logger.error({ error: error.message }, 'CLI Mode: Run-Once scrape cycle encountered a fatal error');
      await app.close();
      process.exit(1);
    }
  } else {
    // Standard HTTP Server mode:
    // Listens on the configured port and keeps the process alive for daily cron jobs
    const app = await NestFactory.create(AppModule, { bufferLogs: true });

    const logger = app.get(Logger);
    app.useLogger(logger);
    app.flushLogs();

    const port = process.env.PORT ?? 3000;
    logger.log(`Booting in Server mode: Listening on port ${port}...`);
    await app.listen(port);
  }
}

bootstrap();
