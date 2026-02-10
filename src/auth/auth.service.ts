import {
  Injectable,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Request } from 'express';

// DTOs
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { OAuthUserDto } from './dto/oauth-user.dto';
import { MfaLoginDto } from './dto/mfa-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestOtpDto } from './dto/request-otp.dto';

// Entities
import { User } from './entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuditAction } from '../audit/entities/audit-log.entity';

// enums
import { AuthProvider } from './enum/auth-provider.enum';
import { Role } from './enum/role.enum';

// Utils
import { normalizePhone } from 'src/common/utils/phone.util';

// Services
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './services/password.service';
import { NotificationService } from '../notification/notification.service';
import { TokenService } from './services/token.service';
import { MfaService } from './services/mfa.service';
import { SessionService } from './services/session.service';
import { UserVerificationService } from './services/user-verification.service';
import { PasswordManagementService } from './services/password-management.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { SessionListDto } from './dto/session.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,

    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mfaService: MfaService,
    private readonly sessionService: SessionService,
    private readonly userVerificationService: UserVerificationService,
    private readonly passwordManagementService: PasswordManagementService,
  ) {}

  // ========================================================================
  // REGISTRATION
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
    await this.checkDuplicateUser(dto.email, dto.phoneNumber);

    // Hash the password
    const hashedPassword = await this.passwordService.hashPassword(
      dto.password,
    );

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

    // ---- Send verification messages ----
    if (savedUser.email) {
      await this.userVerificationService.sendEmailVerification(savedUser);
    }
    if (savedUser.phoneNumber) {
      await this.userVerificationService.sendPhoneVerification(savedUser);
    }

    // Return the user without the password field
    const { password: _password, ...userWithoutPassword } = savedUser;
    return userWithoutPassword;
  }

  // ========================================================================
  // VERIFICATION
  // ========================================================================

  /**
   * Verify email using JWT token
   */
  async verifyEmail(token: string) {
    return this.userVerificationService.verifyEmail(token);
  }

  /**
   * Verify phone number using OTP
   */
  async verifyPhone(dto: VerifyOtpDto) {
    return this.userVerificationService.verifyPhone(dto);
  }

  /**
   * Request OTP
   */
  async requestOtp(dto: RequestOtpDto) {
    return this.userVerificationService.requestOtp(dto);
  }

  /**
   * Verify OTP
   */
  async verifyOtp(dto: VerifyOtpDto) {
    return this.userVerificationService.verifyOtp(dto);
  }

  // ========================================================================
  // AUTHENTICATION FLOW
  // ========================================================================

  /**
   * Validate user credentials and issue an **access JWT**.
   * The token payload contains the user's `sub` (id) and e‑mail.
   * Returns an object `{ accessToken: string }` that will be wrapped
   * by the global TransformInterceptor.
   */
  async login(dto: MfaLoginDto, request?: Request) {
    const { identifier, password, code } = dto;

    // ---- Resolve user by identifier (e‑mail or phone) ----
    const { user, method } = await this.resolveUserByIdentifier(identifier);

    if (!user) {
      await this.auditService.logFailure(AuditAction.LOGIN_FAILED, {
        description: `Login failed - unknown identifier: ${identifier}`,
        metadata: { identifier },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check verification status
    this.checkVerificationStatus(user, method);

    // Validate provider and password
    this.validateLocalAuth(user);
    await this.validatePassword(user, password, identifier);

    if (user.mfaEnabled) {
      if (!code) {
        throw new UnauthorizedException('MFA_REQUIRED');
      }

      const valid = await this.mfaService.verifyMfaCode(user, code);
      if (!valid) {
        throw new UnauthorizedException('Invalid MFA code');
      }
    }

    const tokens = await this.tokenService.generateTokens(user, request);

    // Log success
    await this.logSuccessfulLogin(user, method, identifier, request);

    return tokens;
  }

  /**
   * Revoke a specific refresh token (Logout).
   * * @param dto LogoutDto containing the raw refresh token to invalidate.
   * @returns A success message even if the token was not found (silent fail for security).
   */
  async logout(dto: LogoutDto) {
    const { refreshToken } = dto;

    // Find matching token
    const refreshEntity =
      await this.tokenService.findRefreshTokenByPlainToken(refreshToken);

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

  /**
   * Logout from all devices by revoking all active refresh tokens for the user.
   * @param user The user requesting logout from all devices.
   * @returns A success message.
   */
  async logoutAll(user: User): Promise<{ message: string }> {
    const sessions = await this.refreshTokenRepo.find({
      where: {
        user: { id: user.id },
        revoked: false,
      },
    });

    for (const session of sessions) {
      session.revoked = true;
    }

    await this.refreshTokenRepo.save(sessions);

    await this.auditService.logSuccess(AuditAction.LOGOUT, {
      user,
      description: 'Logout from all devices',
      metadata: { sessionsRevoked: sessions.length },
    });

    return { message: 'Logged out from all devices successfully' };
  }

  // ========================================================================
  // TOKEN MANAGEMENT
  // ========================================================================

  /**
   * Refresh access and refresh tokens
   */
  async refreshTokens(dto: RefreshTokenDto, request?: Request) {
    return this.tokenService.rotateRefreshToken(dto.refreshToken, request);
  }

  /**
   * Issue new token pair for user
   */
  async issueTokens(user: User) {
    return this.tokenService.generateTokens(user);
  }

  // ========================================================================
  // PASSWORD MANAGEMENT
  // ========================================================================

  /**
   * Request password reset
   */
  async requestPasswordReset(dto: ForgotPasswordDto) {
    return this.passwordManagementService.requestPasswordReset(dto);
  }

  /**
   * Reset password using token
   */
  async resetPasswordWithToken(dto: ResetPasswordDto) {
    return this.passwordManagementService.resetPasswordWithToken(dto);
  }

  /**
   * Reset password using OTP
   */
  async resetPasswordWithOtp(
    phoneNumber: string,
    otp: string,
    newPassword: string,
  ) {
    return this.passwordManagementService.resetPasswordWithOtp(
      phoneNumber,
      otp,
      newPassword,
    );
  }

  /**
   * Legacy reset password method (for backward compatibility)
   */
  async resetPassword(dto: ResetPasswordDto) {
    return this.resetPasswordWithToken(dto);
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    user: User,
    currentPassword: string,
    newPassword: string,
  ) {
    return this.passwordManagementService.changePassword(
      user,
      currentPassword,
      newPassword,
    );
  }

  /**
   * Check password strength
   */
  checkPasswordStrength(password: string) {
    return this.passwordManagementService.checkPasswordStrength(password);
  }

  // ========================================================================
  // MFA MANAGEMENT
  // ========================================================================

  /**
   * Setup MFA
   */
  async setupMfa(user: User, password: string) {
    return this.mfaService.setupMfa(user, password);
  }

  /**
   * Verify MFA setup
   */
  async verifyMfaSetup(user: User, code: string) {
    return this.mfaService.verifyMfaSetup(user, code);
  }

  /**
   * Verify MFA code
   */
  async verifyMfaCode(user: User, code: string) {
    return this.mfaService.verifyMfaCode(user, code);
  }

  /**
   * Disable MFA
   */
  async disableMfa(user: User, password: string, code: string) {
    return this.mfaService.disableMfa(user, password, code);
  }

  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(user: User, password: string) {
    return this.mfaService.regenerateBackupCodes(user, password);
  }

  // ========================================================================
  // SESSION MANAGEMENT
  // ========================================================================

  /**
   * Get all active sessions
   */
  async getSessions(user: User): Promise<SessionListDto> {
    return this.sessionService.getSessions(user);
  }

  /**
   * Revoke specific session
   */
  async revokeSession(user: User, sessionId: string): Promise<void> {
    return this.sessionService.revokeSession(user, sessionId);
  }

  /**
   * Revoke all other sessions
   */
  async revokeOtherSessions(
    user: User,
    currentSessionId: string,
  ): Promise<void> {
    return this.sessionService.revokeOtherSessions(user, currentSessionId);
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
    const hashed = await this.passwordService.hashPassword(newPassword);

    user.password = hashed;
    user.authProvider = AuthProvider.LOCAL;

    await this.userRepo.save(user);

    this.logger.log(`Password set for OAuth user: ${user.email}`);

    return { message: 'Password set successfully' };
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
  // PRIVATE HELPERS METHODS
  // ========================================================================

  // --- Registration Helpers ---

  private async checkDuplicateUser(email?: string, phoneNumber?: string) {
    const [dupEmail, dupPhone] = await Promise.all([
      email ? this.userRepo.findOne({ where: { email } }) : null,
      phoneNumber
        ? this.userRepo.findOne({
            where: { phoneNumber: normalizePhone(phoneNumber) },
          })
        : null,
    ]);

    if (dupEmail) {
      throw new BadRequestException('Email already registered');
    }
    if (dupPhone) {
      throw new BadRequestException('Phone number already registered');
    }
  }

  // --- Login Helpers ---

  private async resolveUserByIdentifier(identifier: string): Promise<{
    user: User | null;
    method: 'email' | 'phone';
  }> {
    if (identifier.includes('@')) {
      const user = await this.userRepo.findOne({
        where: { email: identifier },
      });
      return { user, method: 'email' };
    } else {
      const normalized = normalizePhone(identifier);
      const user = await this.userRepo.findOne({
        where: { phoneNumber: normalized },
      });
      return { user, method: 'phone' };
    }
  }

  private checkVerificationStatus(user: User, method: 'email' | 'phone') {
    if (method === 'email' && !user.emailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please check your inbox.',
      );
    }
    if (method === 'phone' && !user.phoneVerified) {
      throw new UnauthorizedException(
        'Phone number not verified. Please verify via OTP.',
      );
    }
  }

  private validateLocalAuth(user: User) {
    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new UnauthorizedException(
        'Please log in using the provider you originally used (Google / Facebook) or set a password first.',
      );
    }

    if (!user.password) {
      throw new UnauthorizedException('Password not set for this account');
    }
  }

  private async validatePassword(
    user: User,
    password: string,
    identifier: string,
  ) {
    const passwordMatches = await this.passwordService.comparePassword(
      password,
      user.password,
    );

    if (!passwordMatches) {
      await this.logFailedLogin(identifier, 'Invalid password', user);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  private async logFailedLogin(
    identifier: string,
    reason: string,
    user?: User,
  ) {
    await this.auditService.logFailure(AuditAction.LOGIN_FAILED, {
      user,
      description: `Login failed - ${reason}: ${identifier}`,
      metadata: { identifier },
    });
  }

  private async logSuccessfulLogin(
    user: User,
    method: 'email' | 'phone',
    identifier: string,
    request?: Request,
  ) {
    await this.auditService.logSuccess(AuditAction.LOGIN_SUCCESS, {
      user,
      description: `Login successful via ${method}`,
      metadata: {
        method,
        identifier,
        deviceName: this.getDeviceName(request),
        ipAddress: this.getClientIp(request),
      },
      ipAddress: this.getClientIp(request),
      userAgent: request?.headers?.['user-agent'],
    });
  }

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

  private getClientIp(request?: Request): string {
    return (
      request?.ip ||
      request?.connection?.remoteAddress ||
      request?.socket?.remoteAddress ||
      'unknown'
    );
  }
}
