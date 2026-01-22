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
import ms from 'ms';
import { RefreshToken } from './entities/refresh-token.entity';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OAuthUserDto } from './dto/oauth-user.dto';
import { AuthProvider } from './enum/auth-provider.enum';
import { Role } from './enum/role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly configService: ConfigService,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokenRepo: Repository<PasswordResetToken>,
  ) {}

  // ------------------------------------------------------------------------
  // -------------------------- HELPERS ------------------------------------
  // ------------------------------------------------------------------------

  /**
   * Find a user by e‑mail (used by OAuth strategies).
   * Returns `null` if not found.
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }
  /** ----------- Bcrypt helpers ----------- */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /** ---------- Compare a plain password against a bcrypt hash ----------- */
  private async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /** ---------- Helper to generate access + refresh ---------- */
  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '1h',
    });

    const refreshToken = await this.createRefreshToken(user);

    return { accessToken, refreshToken };
  }

  /** ----------- Refresh‑token helpers (already existed) ----------- */
  private async hashRefreshToken(token: string): Promise<string> {
    // bcrypt default of 10 rounds
    return bcrypt.hash(token, 10);
  }
  /**
   * Creates a new refresh token row in DB, returns the **plain** token.
   * The token is NOT stored in plain text – only its bcrypt hash is persisted.
   */
  private async createRefreshToken(user: User): Promise<string> {
    const rawToken = randomBytes(40).toString('hex');
    const tokenHash = await this.hashRefreshToken(rawToken);

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

  /** ----------- Password‑reset helpers ----------- */
  private async hashResetToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  }

  /** Create a fresh reset token, persist its hash, and return the plain token */
  private async createResetToken(user: User): Promise<string> {
    const rawToken = randomBytes(40).toString('hex');
    const tokenHash = await this.hashResetToken(rawToken);
    const expiresIn = (this.configService.get<string>(
      'PASSWORD_RESET_EXPIRES_IN',
    ) ?? '30m') as ms.StringValue;
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

  /** Send the reset e‑mail using the existing NotificationService */
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
      password: passwordHash, // ⚠️ không bao giờ null
      pharmacyName: dto.pharmacyName,
      businessLicense: 'UNSET',
      role: Role.USER,
      authProvider: dto.provider,
      providerId: dto.providerId,
      isVerified: true,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`Created new ${dto.provider} user → ${dto.email}`);
    return saved;
  }

  // ------------------------------------------------------------------------
  // -------------------------- PUBLIC API ----------------------------------
  // ------------------------------------------------------------------------
  /**
   * Register a new pharmacy/agent.
   * – Throws BadRequestException if e‑mail already exists.
   * – Returns the created user **without** the password field.
   */
  async register(dto: RegisterDto) {
    // Check e‑mail uniqueness
    const exists = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (exists) {
      this.logger.warn(`Registration attempt with used e‑mail: ${dto.email}`);
      throw new BadRequestException('E‑mail already registered');
    }

    // Hash the password (bcrypt, cost = 10)
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create & persist the user (agentTier defaults to BRONZE, isVerified false)
    const newUser = this.userRepo.create({
      email: dto.email,
      password: hashedPassword,
      pharmacyName: dto.pharmacyName,
      businessLicense: dto.businessLicense,
    });
    const savedUser = await this.userRepo.save(newUser);

    // Create a verification JWT (expires in 24h)
    const token = await this.jwtService.signAsync(
      {
        sub: savedUser.id,
        email: savedUser.email,
      },
      { expiresIn: '24h' },
    );

    // Send the verification e‑mail
    try {
      await this.notificationService.sendVerificationEmail(
        savedUser.email,
        token,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to send verification email to ${savedUser.email}: ${errMsg}`,
      );
      throw err;
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
      payload = await this.jwtService.verifyAsync(token);
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
    if (user.isVerified) {
      this.logger.log(`User ${user.email} already verified`);
      return { message: 'Account already verified' };
    }

    // Flip the flag and persist
    user.isVerified = true;
    await this.userRepo.save(user);
    this.logger.log(`User ${user.email} verified successfully`);

    return { message: 'Account verified successfully' };
  }

  /**
   * Validate user credentials and issue an **access JWT**.
   * The token payload contains the user's `sub` (id) and e‑mail.
   * Returns an object `{ accessToken: string }` that will be wrapped
   * by the global TransformInterceptor.
   */
  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      this.logger.warn(`Login attempt with unknown e-mail: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.authProvider !== AuthProvider.LOCAL) {
      throw new UnauthorizedException(
        'Please log in using the provider you originally used (Google / Facebook) or set a password first.',
      );
    }

    if (!user.isVerified) {
      this.logger.warn(`Login attempt for unverified account: ${dto.email}`);
      throw new UnauthorizedException('Account not verified');
    }

    const passwordMatches = await this.comparePassword(
      dto.password,
      user.password,
    );

    if (!passwordMatches) {
      this.logger.warn(`Invalid password for e-mail: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User ${dto.email} logged in successfully`);

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
   * Request a password reset for a user.
   * @param dto ForgotPasswordDto containing the user's email.
   * @returns A success message even if the e‑mail does not exist (for security).
   */
  async requestPasswordReset(dto: ForgotPasswordDto) {
    const { email } = dto;
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      // Do *not* reveal that the e‑mail does not exist – just pretend we sent.
      this.logger.warn(`Password‑reset requested for unknown e‑mail: ${email}`);
      return { message: 'Sent email successfully' };
    }

    const rawToken = await this.createResetToken(user);
    await this.sendResetEmail(user.email, rawToken);
    this.logger.log(`Password‑reset e‑mail sent to ${email}`);
    return { message: 'Sent email successfully' };
  }

  /**
   * Reset the user's password using a valid reset token.
   * @param dto ResetPasswordDto containing the reset token and new password.
   * @throws BadRequestException if token is invalid, expired, or already used.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const { token, newPassword } = dto;

    // Find *all* non‑revoked, non‑used reset tokens (we’ll compare hashes)
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
}
