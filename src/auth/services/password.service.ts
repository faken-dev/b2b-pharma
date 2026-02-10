import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { randomInt } from 'crypto';

import {
  defaultPasswordPolicy,
  PasswordPolicy,
} from '../config/password-policy.config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordHistory } from '../entities/password-history.entity';

const COMMON_PASSWORDS_PATH = path.join(
  __dirname,
  '../../file/common-passwords.txt',
);

@Injectable()
export class PasswordService {
  private readonly policy: PasswordPolicy;
  private readonly commonPasswords = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(PasswordHistory)
    private readonly passwordHistoryRepo: Repository<PasswordHistory>,
  ) {
    this.policy = defaultPasswordPolicy;

    const data = fs.readFileSync(COMMON_PASSWORDS_PATH, 'utf8');
    data
      .split('\n')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
      .forEach((p) => this.commonPasswords.add(p));
  }

  /**
   * Validate password against policy
   */
  validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < this.policy.minLength) {
      errors.push(
        `Password must be at least ${this.policy.minLength} characters long`,
      );
    }

    if (this.policy.requireUppercase && !/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (this.policy.requireLowercase && !/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (this.policy.requireNumbers && !/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (this.policy.requireSymbols && !/(?=.*[\W_])/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    // Check for common weak patterns
    if (this.isCommonPassword(password)) {
      errors.push('Password is too common or weak');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if password is in common passwords list
   */
  private isCommonPassword(password: string): boolean {
    return this.commonPasswords.has(password.toLowerCase());
  }

  /**
   * Hash password with bcrypt
   */
  async hashPassword(password: string, userId?: string): Promise<string> {
    const validation = this.validatePassword(password);
    if (!validation.isValid) {
      throw new BadRequestException(
        `Password does not meet policy: ${validation.errors.join(', ')}`,
      );
    }

    const hash = await bcrypt.hash(password, 12);

    // Save to history if userId provided
    if (userId) {
      const history = this.passwordHistoryRepo.create({
        passwordHash: hash,
        userId,
      });
      await this.passwordHistoryRepo.save(history);

      // Keep only last N passwords
      await this.cleanupOldPasswords(userId);
    }

    return hash;
  }

  /**
   * Compare password with hash
   */
  async comparePassword(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }

  /**
   * Generate a strong random password
   */
  generateStrongPassword(): string {
    const chars = {
      lower: 'abcdefghijklmnopqrstuvwxyz',
      upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      numbers: '0123456789',
      symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    };

    let password = '';

    if (this.policy.requireLowercase) {
      password += chars.lower[randomInt(chars.lower.length)];
    }

    if (this.policy.requireUppercase) {
      password += chars.upper[randomInt(chars.upper.length)];
    }

    if (this.policy.requireNumbers) {
      password += chars.numbers[randomInt(chars.numbers.length)];
    }

    if (this.policy.requireSymbols) {
      password += chars.symbols[randomInt(chars.symbols.length)];
    }

    const allChars = chars.lower + chars.upper + chars.numbers + chars.symbols;

    while (password.length < this.policy.minLength) {
      password += allChars[randomInt(allChars.length)];
    }

    const arr = password.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr.join('');
  }

  /**
   * Check password strength score (0-100)
   */
  getPasswordStrength(password: string): number {
    let score = 0;

    score += Math.min(password.length * 4, 25);

    if (/(?=.*[a-z])/.test(password)) score += 10;
    if (/(?=.*[A-Z])/.test(password)) score += 10;
    if (/(?=.*\d)/.test(password)) score += 10;
    if (/(?=.*[\W_])/.test(password)) score += 15;

    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 10;

    if (/\d/.test(password) && /\W/.test(password)) score += 10;

    if (this.isCommonPassword(password)) score -= 30;

    return Math.max(0, Math.min(100, score));
  }

  private async cleanupOldPasswords(userId: string) {
    const histories = await this.passwordHistoryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: this.policy.preventReuse,
    });

    for (const history of histories) {
      await this.passwordHistoryRepo.remove(history);
    }
  }

  async isPasswordReused(
    userId: string,
    newPassword: string,
  ): Promise<boolean> {
    const histories = await this.passwordHistoryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: this.policy.preventReuse,
    });

    for (const history of histories) {
      const isMatch = await bcrypt.compare(newPassword, history.passwordHash);
      if (isMatch) return true;
    }

    return false;
  }
}
