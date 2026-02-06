import {
  Injectable,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { NotificationService } from '../notification/notification.service';
import { JwtService } from '@nestjs/jwt';
import ms, { StringValue } from 'ms';
import { RefreshToken } from './entities/refresh-token.entity';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OAuthUserDto } from './dto/oauth-user.dto';
import { AuthProvider } from './enum/auth-provider.enum';
import { Role } from './enum/role.enum';
import { OneTimeToken } from './entities/one-time-token.entity';
import { OneTimeTokenType } from './enum/one-time-token-type';
import { RequestOtpDto } from './dto/request-otp.dto';
import { normalizePhone } from 'src/common/utils/phone.util';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
interface EmailVerifyPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
    private readonly notificationService: NotificationService,
  ) {}

  // ========================================================================
  // AUTHENTICATION FLOW
  // ========================================================================

  /**
   * Register a new pharmacy/agent.
   * – Throws BadRequestException if e‑mail already exists.
   * – Returns the created user **without** the password field.
   */
  async register(dto: RegisterDto) {
    // ---- Ensure at least one contact method ----
    if (!dto.email && !dto.phoneNumber) {
      throw new BadRequestException('Provide either e‑mail or phone number');
    }

    // ---- Uniqueness checks ----
    const [dupEmail, dupPhone] = await Promise.all([
      dto.email ? this.userRepo.findOne({ where: { email: dto.email } }) : null,
      dto.phoneNumber
        ? this.userRepo.findOne({
            where: { phoneNumber: normalizePhone(dto.phoneNumber) },
          })
        : null,
    ]);
    if (dupEmail) throw new BadRequestException('E‑mail already registered');
    if (dupPhone)
      throw new BadRequestException('Phone number already registered');

    // Hash the password (bcrypt, cost = 10)
    const hashedPassword = await this.hashPassword(dto.password);

    // Create & persist the user (agentTier defaults to BRONZE, emailVerified false, phoneVerified false)
    const newUser = this.userRepo.create(<Partial<User>>{
      email: dto.email ?? null,
      phoneNumber: dto.phoneNumber ? normalizePhone(dto.phoneNumber) : null,
      password: hashedPassword,
      pharmacyName: dto.pharmacyName,
      businessLicense: dto.businessLicense,
      role: Role.USER,
      authProvider: AuthProvider.LOCAL,
      emailVerified: false,
      phoneVerified: false,
    });
    const savedUser: User = await this.userRepo.save(newUser);

    if (savedUser.email) {
      const verificationToken =
        await this.createEmailVerificationToken(savedUser);

      await this.notificationService.sendVerificationEmail(
        savedUser.email,
        verificationToken,
      );
    }

    if (savedUser.phoneNumber) {
      const otp = await this.createOtp(
        savedUser,
        OneTimeTokenType.PHONE_VERIFICATION,
        '10m',
      );

      await this.notificationService.sendWhatsApp(
        savedUser.phoneNumber,
        `Your verification code is ${otp}`,
      );
    }

    // Return the user without the password field
    const { password: _password, ...userWithoutPassword } = savedUser;
    return userWithoutPassword;
  }

  /**
   * Verify the e‑mail verification token that was sent to the user.
   *
   * @param token JWT created in register()
   * @throws BadRequestException if token is invalid/expired
   * @throws NotFoundException   if user cannot be found
   */
  async verifyEmail(token: string) {
    // Verify the JWT – this also checks expiration automatically.
    let payload: any;
    try {
      // `jwtService.verifyAsync` will throw on malformed/expired token.
      payload = await this.jwtService.verifyAsync<EmailVerifyPayload>(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Invalid verification token: ${message}`);
      throw new BadRequestException('Invalid or expired verification token');
    }

    // Payload sanity check – we expect an object with `sub` (user id)
    const userId = payload?.sub;
    if (!userId) {
      this.logger.warn(`Verification token missing "sub" claim`);
      throw new BadRequestException('Malformed verification token');
    }

    //Load the user from DB
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.warn(
        `Verification attempted for non‑existent user id=${userId}`,
      );
      throw new BadRequestException('User not found');
    }

    // Idempotent handling – if already verified we simply return.
    if (user.emailVerified) {
      this.logger.log(`User ${user.email} already verified`);
      return { message: 'Account already verified' };
    }

    // Flip the flag and persist
    user.emailVerified = true;
    await this.userRepo.save(user);
    this.logger.log(`User ${user.email} verified successfully`);

    return { message: 'Account verified successfully' };
  }

  /**
   * Verify phone using OTP sent during registration.
   */
  async verifyPhone(dto: VerifyOtpDto) {
    console.log('DTO nhận được:', dto);
    const normalized = normalizePhone(dto.phoneNumber);
    console.log('normal nhận được:', normalized);
    const user = await this.userRepo.findOne({
      where: { phoneNumber: normalized },
    });

    if (!user) {
      throw new BadRequestException('Phone number not found');
    }

    // Validate OTP
    await this.verifyOtpHelper(
      user,
      dto.otp,
      OneTimeTokenType.PHONE_VERIFICATION,
    );

    if (user.phoneVerified) {
      return { message: 'Phone already verified' };
    }

    user.phoneVerified = true;
    await this.userRepo.save(user);

    this.logger.log(`Phone ${normalized} verified successfully`);
    return { message: 'Phone verified successfully' };
  }

  /**
   * Validate user credentials and issue an **access JWT**.
   * The token payload contains the user's `sub` (id) and e‑mail.
   * Returns an object `{ accessToken: string }` that will be wrapped
   * by the global TransformInterceptor.
   */
  async login(dto: LoginDto) {
    const { identifier, password } = dto;
    let user: User | null;
    let method: 'email' | 'phone';

    // ---- Detect identifier type ----
    if (identifier.includes('@')) {
      method = 'email';
      user = await this.userRepo.findOne({ where: { email: identifier } });
    } else {
      method = 'phone';
      const normalized = normalizePhone(identifier);
      user = await this.userRepo.findOne({
        where: { phoneNumber: normalized },
      });
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // ---- Enforce per‑method verification flag ----
    if (method === 'email' && !user.emailVerified) {
      throw new UnauthorizedException(
        'E‑mail not verified. Please check your inbox.',
      );
    }
    if (method === 'phone' && !user.phoneVerified) {
      throw new UnauthorizedException(
        'Phone number not verified. Please verify via OTP.',
      );
    }

    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new UnauthorizedException(
        'Please log in using the provider you originally used (Google / Facebook) or set a password first.',
      );
    }

    if (!user.password) {
      throw new UnauthorizedException('Password not set for this account');
    }

    const passwordMatches = await this.comparePassword(password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);
    return tokens;
  }

  /**
   * Revoke a specific refresh token (Logout).
   * * @param dto LogoutDto containing the raw refresh token to invalidate.
   * @returns A success message even if the token was not found (silent fail for security).
   */
  async logout(dto: LogoutDto) {
    const { refreshToken } = dto;

    // Find all active (non-revoked) tokens from the database.
    const storedTokens = await this.refreshTokenRepo.find({
      where: { revoked: false },
      relations: ['user'],
    });

    // Compare the provided plain token with stored bcrypt hashes.
    const matching = await Promise.all(
      storedTokens.map(async (rt) => {
        const isMatch = await bcrypt.compare(refreshToken, rt.tokenHash);
        return isMatch ? rt : null;
      }),
    );

    const refreshEntity = matching.find((rt) => rt !== null);

    // If found, flip the revoked flag to true to invalidate the session.
    if (refreshEntity) {
      refreshEntity.revoked = true;
      await this.refreshTokenRepo.save(refreshEntity);
      this.logger.log(
        `User ${refreshEntity.user.email} logged out successfully`,
      );
    }

    return { message: 'Logged out successfully' };
  }

  // ========================================================================
  // TOKEN MANAGEMENT
  // ========================================================================

  /**
   * Exchange a valid refresh token for a new pair of tokens (Access + Refresh).
   * This implements "Refresh Token Rotation" for enhanced security.
   * * @param dto RefreshTokenDto containing the current refresh token.
   * @throws UnauthorizedException if token is invalid, revoked, or expired.
   */
  async refreshTokens(dto: RefreshTokenDto) {
    const { refreshToken } = dto;

    // Identify the token by comparing bcrypt hashes.
    const storedTokens = await this.refreshTokenRepo.find({
      where: { revoked: false },
      relations: ['user'],
    });

    const matching = await Promise.all(
      storedTokens.map(async (rt) => {
        const isMatch = await bcrypt.compare(refreshToken, rt.tokenHash);
        return isMatch ? rt : null;
      }),
    );

    const refreshEntity = matching.find((rt) => rt !== null);

    // Validation: Check if token exists and is not expired.
    if (!refreshEntity || refreshEntity.expiresAt < new Date()) {
      this.logger.warn('Refresh attempt with invalid or expired token');
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotation: Revoke the used token and issue a fresh pair.
    refreshEntity.revoked = true;
    await this.refreshTokenRepo.save(refreshEntity);

    this.logger.log(`Tokens rotated for user: ${refreshEntity.user.email}`);
    return this.generateTokens(refreshEntity.user);
  }

  /**
   * Issue access + refresh tokens for a given user.
   * Used by both login and OAuth flows.
   */
  async issueTokens(user: User) {
    return this.generateTokens(user);
  }

  // ========================================================================
  // PASSWORD RESET FLOW
  // ========================================================================

  /**
   * Request password reset.
   * – If email provided → send reset link via email.
   * – If phone provided → send OTP via SMS.
   */
  async requestPasswordReset(dto: ForgotPasswordDto) {
    const { email, phoneNumber } = dto;

    if (!email && !phoneNumber) {
      throw new BadRequestException('Provide either email or phone number');
    }

    let user: User | null = null;
    let method: 'email' | 'phone';

    if (email) {
      method = 'email';
      user = await this.userRepo.findOne({ where: { email } });
    } else {
      method = 'phone';
      const normalized = normalizePhone(phoneNumber!);
      user = await this.userRepo.findOne({
        where: { phoneNumber: normalized },
      });
    }

    if (!user) {
      // Silent fail for security - don't reveal if user exists
      this.logger.warn(
        `Password reset requested for unknown ${method}: ${email || phoneNumber}`,
      );
      return {
        message:
          method === 'email'
            ? 'If this email exists, a reset link has been sent'
            : 'If this phone number exists, an OTP has been sent',
      };
    }

    if (method === 'email') {
      // Send reset link via email
      const resetToken = await this.createPasswordResetToken(user);
      await this.sendResetEmail(user.email!, resetToken);
      this.logger.log(`Password reset email sent to ${user.email}`);
    } else {
      // Send OTP via SMS
      const otp = await this.createOtp(
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

    return {
      message:
        method === 'email'
          ? 'If this email exists, a reset link has been sent'
          : 'If this phone number exists, an OTP has been sent',
    };
  }

  /**
   * Reset password using email token (JWT-based from email link).
   */
  async resetPasswordWithToken(dto: ResetPasswordDto) {
    const { token, newPassword } = dto;

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

    const resetEntity = match.find((rt) => rt !== null);

    if (!resetEntity) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetEntity.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const hashedPw = await this.hashPassword(newPassword);
    resetEntity.user.password = hashedPw;
    await this.userRepo.save(resetEntity.user);

    resetEntity.used = true;
    await this.resetTokenRepo.save(resetEntity);

    this.logger.log(
      `Password reset successful for ${resetEntity.user.email || resetEntity.user.phoneNumber}`,
    );
    return { message: 'Password has been reset successfully' };
  }

  /**
   * Reset password using phone OTP.
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
    await this.verifyOtpHelper(user, otp, OneTimeTokenType.PASSWORD_RESET);

    // Update password
    const hashedPw = await this.hashPassword(newPassword);
    user.password = hashedPw;
    await this.userRepo.save(user);

    this.logger.log(`Password reset via OTP successful for ${normalized}`);
    return { message: 'Password has been reset successfully' };
  }

  // ========================================================================
  // OTP MANAGEMENT
  // ========================================================================

  /**
   * Request an OTP.
   * Default type = PHONE_VERIFICATION (used to verify a phone number).
   * Also for request PASSWORD_RESET (will be used in the password‑reset flow).
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

    const ttl = type === OneTimeTokenType.PASSWORD_RESET ? '30m' : '10m';
    const raw = await this.createOtp(user, type, ttl);

    const message =
      type === OneTimeTokenType.PASSWORD_RESET
        ? `Your PharmaB2B password reset code is ${raw}`
        : `Your PharmaB2B verification code is ${raw}`;

    await this.notificationService.sendSms(normalized, message);

    return { message: 'OTP sent successfully' };
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
   * Reset the user's password using a valid reset token.
   * @param dto ResetPasswordDto containing the reset token and new password.
   * @throws BadRequestException if token is invalid, expired, or already used.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { token, newPassword } = dto;

    // Find *all* non‑revoked, non‑used reset tokens (we'll compare hashes)
    const allTokens = await this.resetTokenRepo.find({
      where: { used: false },
      relations: ['user'],
    });

    // Locate the matching token (bcrypt compare)
    const match = await Promise.all(
      allTokens.map(async (rt) => {
        const ok = await bcrypt.compare(token, rt.tokenHash);
        return ok ? rt : null;
      }),
    );

    const resetEntity = match.find((rt) => rt !== null);
    if (!resetEntity) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetEntity.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // All good – hash the new password, store it, and mark the token used.
    const hashedPw = await this.hashPassword(newPassword);
    resetEntity.user.password = hashedPw;
    await this.userRepo.save(resetEntity.user);

    resetEntity.used = true;
    await this.resetTokenRepo.save(resetEntity);

    this.logger.log(`Password reset successful for ${resetEntity.user.email}`);
    return { message: 'Password has been reset successfully' };
  }

  // ========================================================================
  // OAUTH FLOW
  // ========================================================================

  /**
   * Persist a new user that originated from an OAuth provider.
   * No password is stored – `password` stays null.
   * The account is automatically marked as verified because the provider
   * already verified the e‑mail address.
   */
  async createUserFromOAuth(dto: OAuthUserDto): Promise<User> {
    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const user = this.userRepo.create({
      email: dto.email,
      password: passwordHash,
      pharmacyName: dto.pharmacyName,
      businessLicense: 'UNSET',
      role: Role.USER,
      authProvider: dto.provider,
      providerId: dto.providerId,
      emailVerified: true,
      phoneVerified: false,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`Created new ${dto.provider} user → ${dto.email}`);
    return saved;
  }

  /**
   * Set password for OAuth user to allow local login.
   */
  async setPasswordForOAuthUser(user: User, newPassword: string) {
    const hashed = await this.hashPassword(newPassword);

    user.password = hashed;
    user.authProvider = AuthProvider.LOCAL;

    await this.userRepo.save(user);

    this.logger.log(`Password set for OAuth user: ${user.email}`);

    return { message: 'Password set successfully' };
  }

  // =======================================================================
  // MFA (TOTP) MANAGEMENT
  // ========================================================================

  /**
   * Generate MFA secret and QR code for a user
   */
  async setupMfa(user: User, password: string) {
    if (!user.password) {
      throw new BadRequestException('User has no password set');
    }

    const pwMatch = await this.comparePassword(password, user.password);
    if (!pwMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    const secret = speakeasy.generateSecret({
      name: `PharmaB2B (${user.email || user.phoneNumber})`,
      issuer: 'PharmaB2B',
    });

    if (!secret.otpauth_url) {
      throw new BadRequestException('Failed to generate MFA QR code');
    }

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    const backupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase(),
    );

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

    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      throw new BadRequestException('Invalid MFA code');
    }

    user.mfaEnabled = true;
    user.mfaEnabledAt = new Date();
    await this.userRepo.save(user);

    this.logger.log(`MFA enabled for user ${user.id}`);
    return {
      message: 'MFA enabled successfully',
      backupCodes: user.mfaBackupCodes,
    };
  }

  /**
   * Verify MFA code during login
   */
  async verifyMfaCode(user: User, code: string): Promise<boolean> {
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA not enabled for this account');
    }

    const totpValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (totpValid) {
      return true;
    }

    if (user.mfaBackupCodes?.includes(code)) {
      user.mfaBackupCodes = user.mfaBackupCodes.filter((c) => c !== code);
      await this.userRepo.save(user);
      return true;
    }

    return false;
  }

  /**
   * Disable MFA for a user
   */
  async disableMfa(user: User, password: string, code: string) {
    const pwMatch = await this.comparePassword(password, user.password);
    if (!pwMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    const codeValid = await this.verifyMfaCode(user, code);
    if (!codeValid) {
      throw new BadRequestException('Invalid MFA or backup code');
    }

    user.mfaEnabled = false;
    user.mfaSecret = null;
    user.mfaBackupCodes = null;
    user.mfaEnabledAt = null;

    await this.userRepo.save(user);
    this.logger.log(`MFA disabled for user ${user.id}`);

    return { message: 'MFA disabled successfully' };
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(user: User, password: string) {
    const pwMatch = await this.comparePassword(password, user.password);
    if (!pwMatch) {
      throw new UnauthorizedException('Invalid password');
    }

    const newBackupCodes = Array.from({ length: 8 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase(),
    );

    user.mfaBackupCodes = newBackupCodes;
    await this.userRepo.save(user);

    return { backupCodes: newBackupCodes };
  }

  // ========================================================================
  // USER QUERIES
  // ========================================================================

  /**
   * Find a user by e‑mail (used by OAuth strategies).
   * Returns `null` if not found.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findByPhone(phoneNumber: string): Promise<User | null> {
    const normalized = normalizePhone(phoneNumber);
    return this.userRepo.findOne({ where: { phoneNumber: normalized } });
  }

  // ========================================================================
  // PRIVATE HELPERS - Password Hashing
  // ========================================================================

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  private async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  // ========================================================================
  // PRIVATE HELPERS - Token Generation
  // ========================================================================

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '1h',
    });

    const refreshToken = await this.createRefreshToken(user);

    return { accessToken, refreshToken };
  }

  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  /**
   * Creates a new refresh token row in DB, returns the **plain** token.
   * The token is NOT stored in plain text – only its bcrypt hash is persisted.
   */
  private async createRefreshToken(user: User): Promise<string> {
    const rawToken = randomBytes(40).toString('hex');
    const tokenHash = await this.hashToken(rawToken);

    const expiresInStr = (this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_IN',
    ) ?? '7d') as ms.StringValue;
    const expiresAt = new Date(Date.now() + ms(expiresInStr));

    const refreshEntity = this.refreshTokenRepo.create({
      tokenHash,
      expiresAt,
      user,
      revoked: false,
    });

    await this.refreshTokenRepo.save(refreshEntity);
    return rawToken;
  }

  /**
   * Create email verification token (JWT).
   */
  private async createEmailVerificationToken(user: User): Promise<string> {
    const payload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload, { expiresIn: '24h' });
  }

  /**
   * Create OTP and return the plain code.
   */
  private async createOtp(
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
   * Verify OTP helper.
   */
  private async verifyOtpHelper(
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

  /**
   * Create password reset token (for email-based reset).
   */
  private async createPasswordResetToken(user: User): Promise<string> {
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
   * Send the reset e‑mail using the existing NotificationService.
   */
  private async sendResetEmail(email: string, token: string) {
    const frontUrl =
      this.configService.get<string>('FRONTEND_RESET_URL') ??
      'http://localhost:3000/reset-password';
    const resetLink = `${frontUrl}?token=${encodeURIComponent(token)}`;

    const subject = 'PharmaB2B – Password Reset Request';
    const html = `
      <p>Hello,</p>
      <p>We received a request to reset the password for your PharmaB2B account.</p>
      <p>Please click the button below (or copy the link) to set a new password. This link will expire in ${this.configService.get<string>('PASSWORD_RESET_EXPIRES_IN') ?? '30m'}.</p>
      <a href="${resetLink}"
         style="display:inline-block;padding:10px 20px;background:#28a745;color:#fff;text-decoration:none;border-radius:5px;">
        Reset Password
      </a>
      <p>If you did not request a password reset, you can ignore this e‑mail.</p>
    `;

    await this.notificationService.sendCustomEmail(email, subject, html);
  }
}
