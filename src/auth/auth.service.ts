import {
  Injectable,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
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
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

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
  ) {}

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
  async login(email: string, plainPassword: string) {
    const user = await this.userRepo.findOne({
      where: { email },
    });

    if (!user) {
      this.logger.warn(`Login attempt with unknown e-mail: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isVerified) {
      this.logger.warn(`Login attempt for unverified account: ${email}`);
      throw new UnauthorizedException('Account not verified');
    }

    const passwordMatches = await bcrypt.compare(plainPassword, user.password);

    if (!passwordMatches) {
      this.logger.warn(`Invalid password for e-mail: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // const payload: JwtPayload = {
    //   sub: user.id,
    //   email: user.email,
    // };

    // const accessToken = await this.jwtService.signAsync(payload, {
    //   expiresIn: '1h',
    // });

    this.logger.log(`User ${email} logged in successfully`);

    return this.generateTokens(user);
  }

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

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '1h',
    });

    const refreshToken = await this.createRefreshToken(user);

    return { accessToken, refreshToken };
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
}
