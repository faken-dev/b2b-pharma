import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';

import { User } from '../entities/user.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  // ========================================================================
  // MFA SETUP
  // ========================================================================

  /**
   * Setup MFA for user - generate secret and QR code
   */
  async setupMfa(user: User, password: string) {
    // Verify password
    if (!user.password) {
      throw new BadRequestException('User has no password set');
    }

    const pwMatch = await this.comparePassword(password, user.password);
    if (!pwMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `PharmaB2B (${user.email || user.phoneNumber})`,
      issuer: 'PharmaB2B',
    });

    if (!secret.otpauth_url) {
      throw new BadRequestException('Failed to generate MFA QR code');
    }

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();

    // Save to user (not enabled yet)
    user.mfaSecret = secret.base32;
    user.mfaBackupCodes = backupCodes;
    user.mfaEnabled = false;
    user.mfaEnabledAt = null;
    await this.userRepo.save(user);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Verify MFA setup with TOTP code
   */
  async verifyMfaSetup(user: User, code: string) {
    if (!user.mfaSecret) {
      throw new BadRequestException('MFA not set up for this user');
    }

    const verified = this.verifyTotpCode(user.mfaSecret, code);

    if (!verified) {
      await this.auditService.logFailure(AuditAction.MFA_FAILED, {
        user,
        description: 'MFA setup verification failed',
      });
      throw new BadRequestException('Invalid MFA code');
    }

    // Enable MFA
    user.mfaEnabled = true;
    user.mfaEnabledAt = new Date();
    await this.userRepo.save(user);

    await this.auditService.logSuccess(AuditAction.MFA_VERIFIED, {
      user,
      description: 'MFA setup completed successfully',
    });

    return {
      message: 'MFA enabled successfully',
      backupCodes: user.mfaBackupCodes,
    };
  }

  // ========================================================================
  // MFA VERIFICATION
  // ========================================================================

  /**
   * Verify MFA code during login (supports TOTP and backup codes)
   */
  async verifyMfaCode(user: User, code: string): Promise<boolean> {
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA not enabled for this account');
    }

    // Try TOTP first
    const totpValid = this.verifyTotpCode(user.mfaSecret, code);

    if (totpValid) {
      return true;
    }

    // Try backup codes
    if (user.mfaBackupCodes?.includes(code)) {
      // Remove used backup code
      user.mfaBackupCodes = user.mfaBackupCodes.filter((c) => c !== code);
      await this.userRepo.save(user);

      this.logger.log(`Backup code used for user ${user.id}`);
      return true;
    }

    return false;
  }

  // ========================================================================
  // MFA MANAGEMENT
  // ========================================================================

  /**
   * Disable MFA for user
   */
  async disableMfa(user: User, password: string, code: string) {
    // Verify password
    const pwMatch = await this.comparePassword(password, user.password);
    if (!pwMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    // Verify MFA code
    const codeValid = await this.verifyMfaCode(user, code);
    if (!codeValid) {
      throw new BadRequestException('Invalid MFA or backup code');
    }

    // Disable MFA
    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = null;
    user.mfaEnabledAt = null;
    await this.userRepo.save(user);

    this.logger.log(`MFA disabled for user ${user.id}`);

    await this.auditService.logSuccess(AuditAction.MFA_DISABLED, {
      user,
      description: 'MFA disabled',
    });

    return { message: 'MFA disabled successfully' };
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(user: User, password: string) {
    // Verify password
    const pwMatch = await this.comparePassword(password, user.password);
    if (!pwMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    // Generate new codes
    const newBackupCodes = this.generateBackupCodes();

    user.mfaBackupCodes = newBackupCodes;
    await this.userRepo.save(user);

    this.logger.log(`Backup codes regenerated for user ${user.id}`);

    return { backupCodes: newBackupCodes };
  }

  // ========================================================================
  // PRIVATE HELPER METHODS
  // ========================================================================

  /**
   * Verify TOTP code
   */
  private verifyTotpCode(secret: string, code: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 time steps before/after for clock drift
    });
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 8): string[] {
    return Array.from({ length: count }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase(),
    );
  }

  /**
   * Compare password with hash
   */
  private async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
