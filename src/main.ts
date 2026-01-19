import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const winstonLogger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);

  app.useLogger(winstonLogger);

  await app.listen(3000);

  winstonLogger.log(
    `Application is running on: ${
      process.env.APP_URL ?? 'http://localhost:3000'
    }`,
  );
}

// Explicitly handle the promise
void bootstrap();
