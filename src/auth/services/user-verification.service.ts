import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { RequestOtpDto } from '../dto/request-otp.dto';
import { OneTimeTokenType } from '../enum/one-time-token-type';
import { NotificationService } from '../../notification/notification.service';
import { TokenService } from './token.service';
import { normalizePhone } from 'src/common/utils/phone.util';

interface EmailVerifyPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class UserVerificationService {
  private readonly logger = new Logger(UserVerificationService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
  ) {}

  // ========================================================================
  // EMAIL VERIFICATION
  // ========================================================================

  /**
   * Send email verification
   */
  async sendEmailVerification(user: User): Promise<void> {
    if (!user.email) {
      throw new BadRequestException('User has no email address');
    }

    const verificationToken =
      await this.tokenService.createEmailVerificationToken(user);

    await this.notificationService.sendVerificationEmail(
      user.email,
      verificationToken,
    );

    this.logger.log(`Verification email sent to ${user.email}`);
  }

  /**
   * Verify email using JWT token
   */
  async verifyEmail(token: string) {
    // Verify and decode token
    let payload: EmailVerifyPayload;
    try {
      payload = await this.tokenService.verifyJwtToken(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Invalid verification token: ${message}`);
      throw new BadRequestException('Invalid or expired verification token');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new BadRequestException('Malformed verification token');
    }

    // Load and verify user
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Idempotent check
    if (user.emailVerified) {
      this.logger.log(`User ${user.email} already verified`);
      return { message: 'Account already verified' };
    }

    // Mark as verified
    user.emailVerified = true;
    await this.userRepo.save(user);

    this.logger.log(`User ${user.email} verified successfully`);
    return { message: 'Account verified successfully' };
  }

  // ========================================================================
  // PHONE VERIFICATION
  // ========================================================================

  /**
   * Send phone verification OTP
   */
  async sendPhoneVerification(user: User): Promise<void> {
    if (!user.phoneNumber) {
      throw new BadRequestException('User has no phone number');
    }

    const otp = await this.tokenService.createOtp(
      user,
      OneTimeTokenType.PHONE_VERIFICATION,
      '10m',
    );

    await this.notificationService.sendWhatsApp(
      user.phoneNumber,
      `Your verification code is ${otp}`,
    );

    this.logger.log(`Verification OTP sent to ${user.phoneNumber}`);
  }

  /**
   * Verify phone number using OTP
   */
  async verifyPhone(dto: VerifyOtpDto) {
    const normalized = normalizePhone(dto.phoneNumber);
    const user = await this.userRepo.findOne({
      where: { phoneNumber: normalized },
    });

    if (!user) {
      throw new BadRequestException('Phone number not found');
    }

    // Validate OTP
    await this.tokenService.verifyOtpHelper(
      user,
      dto.otp,
      OneTimeTokenType.PHONE_VERIFICATION,
    );

    // Idempotent check
    if (user.phoneVerified) {
      return { message: 'Phone already verified' };
    }

    // Mark as verified
    user.phoneVerified = true;
    await this.userRepo.save(user);

    this.logger.log(`Phone ${normalized} verified successfully`);
    return { message: 'Phone verified successfully' };
  }

  // ========================================================================
  // OTP MANAGEMENT
  // ========================================================================

  /**
   * Request OTP for phone verification or password reset
   */
  async requestOtp(dto: RequestOtpDto) {
    const type = dto.type ?? OneTimeTokenType.PHONE_VERIFICATION;
    const normalized = normalizePhone(dto.phoneNumber);

    const user = await this.userRepo.findOne({
      where: { phoneNumber: normalized },
    });

    if (!user) {
      throw new BadRequestException('Phone number not found');
    }

    // Generate OTP with appropriate TTL
    const ttl = type === OneTimeTokenType.PASSWORD_RESET ? '30m' : '10m';
    const raw = await this.tokenService.createOtp(user, type, ttl);

    // Send OTP
    const message =
      type === OneTimeTokenType.PASSWORD_RESET
        ? `Your PharmaB2B password reset code is ${raw}`
        : `Your PharmaB2B verification code is ${raw}`;

    await this.notificationService.sendSms(normalized, message);

    this.logger.log(`OTP sent to ${normalized} for ${type}`);

    return { message: 'OTP sent successfully' };
  }

  /**
   * Verify OTP and perform appropriate action
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
    await this.tokenService.verifyOtpHelper(user, dto.otp, type);

    // Perform action based on type
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

  // ========================================================================
  // RESEND VERIFICATION
  // ========================================================================

  /**
   * Resend verification based on user's contact method
   */
  async resendVerification(user: User, method: 'email' | 'phone') {
    if (method === 'email') {
      if (!user.email) {
        throw new BadRequestException('User has no email address');
      }
      if (user.emailVerified) {
        throw new BadRequestException('Email already verified');
      }
      await this.sendEmailVerification(user);
      return { message: 'Verification email sent' };
    } else {
      if (!user.phoneNumber) {
        throw new BadRequestException('User has no phone number');
      }
      if (user.phoneVerified) {
        throw new BadRequestException('Phone already verified');
      }
      await this.sendPhoneVerification(user);
      return { message: 'Verification OTP sent' };
    }
  }
}
