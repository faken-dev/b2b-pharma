import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { winstonConsoleFormat } from './logger.format';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule,
    // Winston logger
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logLevel = config.get<string>('LOG_LEVEL') ?? 'info';
        return {
          level: logLevel,
          transports: [
            new winston.transports.Console({
              format: winstonConsoleFormat,
            }),
            // Log transport to files use in production
            // new winston.transports.File({ filename: 'logs/app.log' })
          ],
        };
      },
    }),
  ],
  providers: [
    // ---- Global TransformInterceptor ----
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // ---- Global Exception Filter ----
    {
      provide: APP_FILTER,
      useFactory: (config: ConfigService) => new AllExceptionsFilter(config),
      inject: [ConfigService],
    },
  ],
  exports: [WinstonModule],
})
export class CoreModule {}
