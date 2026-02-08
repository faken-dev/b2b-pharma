import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const winstonLogger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);

  app.useGlobalPipes(new ValidationPipe());

  app.useGlobalFilters(new ThrottlerExceptionFilter());

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
