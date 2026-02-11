import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/database.config';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SecurityMiddleware } from './common/middleware/security.middleware';
import { AppController } from './app.controller';

@Module({
  imports: [
    // Load .env automatically
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.example'],
    }),

    // DB connection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: typeOrmConfig,
    }),

    // Rare limiting Configuration
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => [
        {
          name: 'short',
          ttl: 60000,
          limit: 5,
        },
        {
          name: 'medium',
          ttl: 300000,
          limit: 20,
        },
        {
          name: 'long',
          ttl: 3600000,
          limit: 100,
        },
      ],
    }),

    CoreModule,
    AuthModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    // Global Rate Limiting Guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware).forRoutes('*');
  }
}
