import {
  Injectable,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import ms, { StringValue } from 'ms';
import { randomBytes } from 'crypto';
import { Request } from 'express';

import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { OneTimeToken } from '../entities/one-time-token.entity';
import { OneTimeTokenType } from '../enum/one-time-token-type';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { normalizePhone } from 'src/common/utils/phone.util';

interface EmailVerifyPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
    @InjectRepository(OneTimeToken)
    private readonly otpRepo: Repository<OneTimeToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ========================================================================
  // JWT ACCESS TOKEN
  // ========================================================================

  /**
   * Generate access and refresh tokens for user
   */
  async generateTokens(user: User, request?: Request) {
    const payload = {
      sub: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '1h',
    });

    const { rawToken, session } = await this.createRefreshTokenWithSession(
      user,
      request,
    );

    return {
      accessToken,
      refreshToken: rawToken,
      sessionId: session.id,
    };
  }

  /**
   * Verify JWT token
   */
  async verifyJwtToken(token: string): Promise<EmailVerifyPayload> {
    return this.jwtService.verifyAsync(token);
  }

  // ========================================================================
  // REFRESH TOKEN
  // ========================================================================

  /**
   * Create refresh token with session information
   */
  private async createRefreshTokenWithSession(user: User, request?: Request) {
    const rawToken = randomBytes(40).toString('hex');
    const tokenHash = await this.hashToken(rawToken);

    const expiresInStr = (this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
    ) ?? '7d') as ms.StringValue;
    const expiresAt = new Date(Date.now() + ms(expiresInStr));

    const session = this.refreshTokenRepo.create({
      tokenHash,
      expiresAt,
      user,
      revoked: false,
      isActive: true,
      deviceName: this.getDeviceName(request),
      deviceType: this.getDeviceType(request),
      userAgent: request?.headers?.['user-agent'],
      ipAddress: this.getClientIp(request),
      location: 'Unknown',
    });

    await this.refreshTokenRepo.save(session);
    return { rawToken, session };
  }

  /**
   * Find refresh token by plain token string
   */
  async findRefreshTokenByPlainToken(
    plainToken: string,
  ): Promise<RefreshToken | null> {
    const storedTokens = await this.refreshTokenRepo.find({
      where: { revoked: false },
      relations: ['user'],
    });

    const matching = await Promise.all(
      storedTokens.map(async (rt) => {
        const isMatch = await bcrypt.compare(plainToken, rt.tokenHash);
        return isMatch ? rt : null;
      }),
    );

    return matching.find((rt) => rt !== null) || null;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(refreshToken: RefreshToken): Promise<void> {
    refreshToken.revoked = true;
    await this.refreshTokenRepo.save(refreshToken);
  }

  /**
   * Validate and rotate refresh token
   */
  async rotateRefreshToken(plainToken: string, request?: Request) {
    const refreshEntity = await this.findRefreshTokenByPlainToken(plainToken);

    if (!refreshEntity || refreshEntity.expiresAt < new Date()) {
      this.logger.warn('Refresh attempt with invalid or expired token');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old token (rotation)
    refreshEntity.revoked = true;
    await this.refreshTokenRepo.save(refreshEntity);

    // Issue new tokens
    this.logger.log(`Tokens rotated for user: ${refreshEntity.user.email}`);
    return this.generateTokens(refreshEntity.user, request);
  }

  // ========================================================================
  // EMAIL VERIFICATION TOKEN
  // ========================================================================

  /**
   * Create email verification token (JWT)
   */
  async createEmailVerificationToken(user: User): Promise<string> {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload, { expiresIn: '24h' });
  }

  // ========================================================================
  // PASSWORD RESET TOKEN
  // ========================================================================

  /**
   * Create password reset token
   */
  async createPasswordResetToken(user: User): Promise<string> {
    const rawToken = randomBytes(40).toString('hex');
    const tokenHash = await this.hashToken(rawToken);

    const expiresIn = (this.configService.get('PASSWORD_RESET_EXPIRES_IN') ??
      '30m') as ms.StringValue;
    const expiresAt = new Date(Date.now() + ms(expiresIn));

    const entity = this.resetTokenRepo.create({
      tokenHash,
      expiresAt,
      used: false,
      user,
    });

    await this.resetTokenRepo.save(entity);
    return rawToken;
  }

  /**
   * Find password reset token by plain token
   */
  async findPasswordResetToken(
    token: string,
  ): Promise<PasswordResetToken | null> {
    const allTokens = await this.resetTokenRepo.find({
      where: { used: false },
      relations: ['user'],
    });

    const match = await Promise.all(
      allTokens.map(async (rt) => {
        const ok = await bcrypt.compare(token, rt.tokenHash);
        return ok ? rt : null;
      }),
    );

    return match.find((rt) => rt !== null) || null;
  }

  /**
   * Mark password reset token as used
   */
  async markPasswordResetTokenAsUsed(token: PasswordResetToken): Promise<void> {
    token.used = true;
    await this.resetTokenRepo.save(token);
  }

  // ========================================================================
  // OTP (ONE-TIME PASSWORD)
  // ========================================================================

  /**
   * Create OTP and return plain code
   */
  async createOtp(
    user: User,
    type: OneTimeTokenType,
    ttl: StringValue = '10m',
  ): Promise<string> {
    const raw = randomBytes(3).toString('hex');
    const hash = await this.hashToken(raw);

    const ttlMs = ms(ttl);
    const expiresAt = new Date(Date.now() + ttlMs);

    const token = this.otpRepo.create({
      tokenHash: hash,
      expiresAt,
      used: false,
      type,
      user,
    });

    await this.otpRepo.save(token);
    return raw;
  }

  /**
   * Verify an OTP.
   * Depending on the token type, it will:
   *   - EMAIL_VERIFICATION → set user.emailVerified = true
   *   - PHONE_VERIFICATION → set user.phoneVerified = true
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const type = dto.type ?? OneTimeTokenType.PHONE_VERIFICATION;
    const normalized = normalizePhone(dto.phoneNumber);

    const user = await this.userRepo.findOne({
      where: { phoneNumber: normalized },
    });

    if (!user) {
      throw new BadRequestException('Phone number not found');
    }

    // Validate OTP
    await this.verifyOtpHelper(user, dto.otp, type);

    switch (type) {
      case OneTimeTokenType.PHONE_VERIFICATION:
        user.phoneVerified = true;
        await this.userRepo.save(user);
        return { message: 'Phone verified successfully' };

      case OneTimeTokenType.PASSWORD_RESET:
        return { message: 'OTP verified. You can now reset your password.' };

      default:
        throw new BadRequestException('Unsupported OTP type');
    }
  }

  /**
   * Verify OTP helper.
   */
  async verifyOtpHelper(
    user: User,
    raw: string,
    type: OneTimeTokenType,
  ): Promise<void> {
    const candidates = await this.otpRepo.find({
      where: { used: false, type, user: user },
    });

    for (const t of candidates) {
      const ok = await bcrypt.compare(raw, t.tokenHash);
      if (ok) {
        if (t.expiresAt < new Date()) {
          throw new BadRequestException('OTP has expired');
        }
        t.used = true;
        await this.otpRepo.save(t);
        return;
      }
    }

    throw new BadRequestException('Invalid OTP');
  }

  // ========================================================================
  // HELPER METHODS
  // ========================================================================

  /**
   * Hash token using bcrypt
   */
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  /**
   * Extract device name from User-Agent
   */
  private getDeviceName(request?: Request): string {
    const ua = request?.headers['user-agent'] ?? '';
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Macintosh')) return 'Mac';
    if (ua.includes('Linux')) return 'Linux PC';
    return 'Unknown Device';
  }

  /**
   * Extract device type from User-Agent
   */
  private getDeviceType(request?: Request): string {
    const ua = request?.headers['user-agent'] ?? '';
    if (
      ua.includes('Mobile') ||
      ua.includes('Android') ||
      ua.includes('iPhone')
    ) {
      return 'mobile';
    }
    if (ua.includes('Tablet') || ua.includes('iPad')) {
      return 'tablet';
    }
    return 'desktop';
  }

  /**
   * Get client IP address
   */
  private getClientIp(request?: Request): string {
    return (
      request?.ip ||
      request?.connection?.remoteAddress ||
      request?.socket?.remoteAddress ||
      'unknown'
    );
  }
}
