import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { User } from '../entities/user.entity';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { OneTimeTokenType } from '../enum/one-time-token-type';
import { NotificationService } from '../../notification/notification.service';
import { TokenService } from './token.service';
import { PasswordService } from './password.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';
import { normalizePhone } from 'src/common/utils/phone.util';

@Injectable()
export class PasswordManagementService {
  private readonly logger = new Logger(PasswordManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  // ========================================================================
  // PASSWORD RESET REQUEST
  // ========================================================================

  /**
   * Request password reset via email or phone
   */
  async requestPasswordReset(dto: ForgotPasswordDto) {
    const { email, phoneNumber } = dto;

    if (!email && !phoneNumber) {
      throw new BadRequestException('Provide either email or phone number');
    }

    const { user, method } = email
      ? await this.findUserByEmail(email)
      : await this.findUserByPhone(phoneNumber!);

    // Silent fail for security - don't reveal if user exists
    if (!user) {
      this.logger.warn(
        `Password reset requested for unknown ${method}: ${email || phoneNumber}`,
      );
      return this.getPasswordResetMessage(method);
    }

    // Send reset token/OTP based on method
    if (method === 'email') {
      await this.sendPasswordResetEmail(user);
    } else {
      await this.sendPasswordResetOtp(user);
    }

    return this.getPasswordResetMessage(method);
  }

  // ========================================================================
  // PASSWORD RESET EXECUTION
  // ========================================================================

  /**
   * Reset password using email token
   */
  async resetPasswordWithToken(dto: ResetPasswordDto) {
    const { token, newPassword } = dto;

    // Find and validate token
    const resetEntity = await this.tokenService.findPasswordResetToken(token);

    if (!resetEntity) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetEntity.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Update password
    await this.updateUserPassword(resetEntity.user, newPassword);

    // Mark token as used
    await this.tokenService.markPasswordResetTokenAsUsed(resetEntity);

    this.logger.log(
      `Password reset successful for ${resetEntity.user.email || resetEntity.user.phoneNumber}`,
    );

    await this.auditService.logSuccess(AuditAction.PASSWORD_RESET, {
      user: resetEntity.user,
      description: 'Password reset via email token',
    });

    return { message: 'Password has been reset successfully' };
  }

  /**
   * Reset password using phone OTP
   */
  async resetPasswordWithOtp(
    phoneNumber: string,
    otp: string,
    newPassword: string,
  ) {
    const normalized = normalizePhone(phoneNumber);
    const user = await this.userRepo.findOne({
      where: { phoneNumber: normalized },
    });

    if (!user) {
      throw new BadRequestException('Phone number not found');
    }

    // Verify OTP
    await this.tokenService.verifyOtpHelper(
      user,
      otp,
      OneTimeTokenType.PASSWORD_RESET,
    );

    // Update password
    await this.updateUserPassword(user, newPassword);

    this.logger.log(`Password reset via OTP successful for ${normalized}`);

    await this.auditService.logSuccess(AuditAction.PASSWORD_RESET, {
      user,
      description: 'Password reset via OTP',
    });

    return { message: 'Password has been reset successfully' };
  }

  // ========================================================================
  // PASSWORD CHANGE
  // ========================================================================

  /**
   * Change password for authenticated user
   */
  async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string,
  ) {
    // Verify current password
    if (!user.password) {
      throw new BadRequestException('Password not set for this account');
    }

    const currentPwMatch = await this.passwordService.comparePassword(
      currentPassword,
      user.password,
    );

    if (!currentPwMatch) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Ensure new password is different
    const newPwMatch = await this.passwordService.comparePassword(
      newPassword,
      user.password,
    );

    if (newPwMatch) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    // Update password
    user.password = await this.passwordService.hashPassword(newPassword);
    await this.userRepo.save(user);

    this.logger.log(`Password changed for user ${user.id}`);

    // Audit log
    await this.auditService.logSuccess(AuditAction.PASSWORD_CHANGED, {
      user,
      description: 'Password changed successfully',
    });

    return { message: 'Password changed successfully' };
  }

  // ========================================================================
  // PASSWORD VALIDATION
  // ========================================================================

  /**
   * Check password strength and policy compliance
   */
  checkPasswordStrength(password: string) {
    const strength = this.passwordService.getPasswordStrength(password);
    const validation = this.passwordService.validatePassword(password);

    return {
      strength,
      isValid: validation.isValid,
      errors: validation.errors,
      strengthLevel: this.getStrengthLevel(strength),
    };
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  private async findUserByEmail(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    return { user, method: 'email' as const };
  }

  private async findUserByPhone(phoneNumber: string) {
    const normalized = normalizePhone(phoneNumber);
    const user = await this.userRepo.findOne({
      where: { phoneNumber: normalized },
    });
    return { user, method: 'phone' as const };
  }

  private getPasswordResetMessage(method: 'email' | 'phone') {
    return {
      message:
        method === 'email'
          ? 'If this email exists, a reset link has been sent'
          : 'If this phone number exists, an OTP has been sent',
    };
  }

  private async sendPasswordResetEmail(user: User) {
    const resetToken = await this.tokenService.createPasswordResetToken(user);
    await this.sendResetEmail(user.email!, resetToken);
    this.logger.log(`Password reset email sent to ${user.email}`);
  }

  private async sendPasswordResetOtp(user: User) {
    const otp = await this.tokenService.createOtp(
      user,
      OneTimeTokenType.PASSWORD_RESET,
      '30m',
    );
    await this.notificationService.sendSms(
      user.phoneNumber!,
      `Your PharmaB2B password reset code is ${otp}`,
    );
    this.logger.log(`Password reset OTP sent to ${user.phoneNumber}`);
  }

  private async updateUserPassword(user: User, newPassword: string) {
    const hashedPw = await this.passwordService.hashPassword(newPassword);
    user.password = hashedPw;
    await this.userRepo.save(user);
  }

  private getStrengthLevel(score: number): string {
    if (score >= 80) return 'strong';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'weak';
  }

  private async sendResetEmail(email: string, token: string) {
    const frontUrl =
      this.configService.get<string>('FRONTEND_RESET_URL') ??
      'http://localhost:3000/reset-password';
    const resetLink = `${frontUrl}?token=${encodeURIComponent(token)}`;

    const subject = 'PharmaB2B – Password Reset Request';
    const html = `
      <div>
        <p>Hello,</p>
        <p>We received a request to reset the password for your PharmaB2B account.</p>
        <p>Please click the button below (or copy the link) to set a new password. 
        This link will expire in ${this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN') ?? '30m'}.</p>
        <p><a href="${resetLink}" style="padding: 10px 20px; background: #007bff; color: #fff; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>If you did not request a password reset, you can ignore this email.</p>
      </div>
    `;

    await this.notificationService.sendCustomEmail(email, subject, html);
  }
}
