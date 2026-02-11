import { NestFactory } from '@nestjs/core';
import { ValidationPipe, LoggerService } from '@nestjs/common';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';

async function bootstrap(): Promise<void> {
  // ==============================
  // CREATE APPLICATION
  // ==============================
  const app = await NestFactory.create(AppModule);

  // ==============================
  // LOGGER CONFIGURATION
  // ==============================
  const winstonLogger = app.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);

  // ==============================
  // SECURITY HEADERS (HELMET)
  // ==============================
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      xssFilter: true,
    }),
  );

  // ==============================
  // CORS CONFIGURATION
  // ==============================
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
  });

  // ==============================
  // GLOBAL VALIDATION
  // ==============================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ==============================
  // GLOBAL FILTERS
  // ==============================
  app.useGlobalFilters(new ThrottlerExceptionFilter());

  // ==============================
  // START SERVER
  // ==============================
  const port = process.env.PORT || 3000;
  await app.listen(port);

  winstonLogger.log(
    `Application is running on: ${
      process.env.APP_URL ?? `http://localhost:${port}`
    }`,
  );
}

void bootstrap();
