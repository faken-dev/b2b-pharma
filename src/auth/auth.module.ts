import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { NotificationModule } from '../notification/notification.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { PassportModule } from '@nestjs/passport';
import { RefreshToken } from './entities/refresh-token.entity';
import { TierGuard } from './guard/tier.guard';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { OneTimeToken } from './entities/one-time-token.entity';
import { AuditModule } from 'src/audit/audit.module';
import { TokenService } from './services/token.service';
import { MfaService } from './services/mfa.service';
import { SessionService } from './services/session.service';
import { PasswordManagementService } from './services/password-management.service';
import { PasswordService } from './services/password.service';
import { UserVerificationService } from './services/user-verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      PasswordResetToken,
      OneTimeToken,
    ]),
    NotificationModule,
    AuditModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'default_jwt_secret',
        signOptions: { expiresIn: '24h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MfaService,
    SessionService,
    UserVerificationService,
    PasswordService,
    PasswordManagementService,
    JwtStrategy,
    JwtAuthGuard,
    TierGuard,
    GoogleStrategy,
    FacebookStrategy,
  ],
  exports: [AuthService, TierGuard],
})
export class AuthModule {}
