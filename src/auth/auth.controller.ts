import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { AgentTier } from './enum/agent-tier.enum';
import { Tier } from './decorator/tier.decorator';
import { TierGuard } from './guard/tier.guard';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { SetPasswordDto } from './dto/set-password.dto';
import { User } from './entities/user.entity';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { MfaSetupDto } from './dto/mfa-setup.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { MfaDisableDto } from './dto/mfa-disable.dto';
import { MfaLoginDto } from './dto/mfa-login.dto';

interface RequestWithUser extends Request {
  user: User;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ======================================================
  //  AUTHENTICATION – REGISTER / LOGIN / VERIFY
  // ======================================================

  /**
   * POST /auth/register
   * Creates a new account and sends a verification e-mail.
   * Returns the created user (password excluded).
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new pharmacy/agent (email or phone required)',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * GET /auth/verify?token=...
   * Confirms the e-mail address using the verification token.
   */
  @Get('verify')
  @ApiOperation({ summary: 'Verify e-mail address using token' })
  async verify(@Query() query: VerifyEmailDto) {
    return this.authService.verifyEmail(query.token);
  }

  /**
   * POST /auth/verify-phone
   * Verifies phone number using OTP code.
   */
  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone number using OTP' })
  async verifyPhone(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyPhone(dto);
  }

  /**
   * POST /auth/login
   * Authenticates user credentials and returns JWT tokens.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with e-mail & password' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  // ======================================================
  //  TOKEN MANAGEMENT
  // ======================================================

  /**
   * POST /auth/refresh
   * Issues a new access token using a valid refresh token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT pair using a refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  /**
   * POST /auth/logout
   * Revokes the given refresh token and logs the user out.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout – invalidate a refresh token' })
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  // ======================================================
  //  OTP
  // ======================================================

  /**
   * POST /auth/otp/request
   * Sends an OTP to the user’s phone for verification or password reset.
   */
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Request OTP – default is phone verification; use type = PASSWORD_RESET for reset flow',
  })
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  /**
   * POST /auth/otp/verify
   * Verifies the OTP code for phone verification or password reset.
   */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify OTP, update verification flags, or confirm password‑reset OTP',
  })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ======================================================
  //  PASSWORD RECOVERY
  // ======================================================

  /**
   * POST /auth/forgot-password
   * Sends a password reset e-mail if the user exists.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  /**
   * POST /auth/reset-password
   * Updates the password using the reset token from e-mail.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // @Post('reset-password-otp')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Reset password using phone OTP' })
  // async resetPasswordOtp(@Body() dto: ResetPasswordOtpDto) {
  //   return this.authService.resetPasswordWithOtp(dto.phoneNumber, dto.otp, dto.newPassword);
  // }

  /**
   * POST /auth/set-password
   * Allows a logged‑in social user to set a local password.
   * After this call the account’s authProvider becomes LOCAL.
   */
  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  async setPassword(@Req() req: RequestWithUser, @Body() dto: SetPasswordDto) {
    return this.authService.setPasswordForOAuthUser(req.user, dto.newPassword);
  }

  // -----------------------------------------------------------------
  // MFA ENDPOINTS (Protected by JWT)
  // -----------------------------------------------------------------

  /**
   * POST /auth/mfa/setup
   * Generates MFA secret and QR code for the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Setup MFA - generates secret and QR code' })
  async setupMfa(@Req() req: RequestWithUser, @Body() dto: MfaSetupDto) {
    return this.authService.setupMfa(req.user, dto.password);
  }

  /**
   * POST /auth/mfa/verify-setup
   * Verifies the TOTP code and enables MFA for the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/verify-setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify MFA setup with TOTP code' })
  async verifyMfaSetup(@Req() req: RequestWithUser, @Body() dto: MfaVerifyDto) {
    return this.authService.verifyMfaSetup(req.user, dto.code);
  }

  /**
   * POST /auth/mfa/disable
   * Disables MFA for the current user after verifying password and code.
   */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable MFA for current user' })
  async disableMfa(@Req() req: RequestWithUser, @Body() dto: MfaDisableDto) {
    return this.authService.disableMfa(req.user, dto.password, dto.code);
  }

  /**
   * POST /auth/mfa/regenerate-backup-codes
   * Generates new MFA backup codes for the current user.
   */
  @UseGuards(JwtAuthGuard)
  @Post('mfa/regenerate-backup-codes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate new MFA backup codes' })
  async regenerateBackupCodes(
    @Req() req: RequestWithUser,
    @Body() dto: MfaSetupDto,
  ) {
    return this.authService.regenerateBackupCodes(req.user, dto.password);
  }

  // ======================================================
  //  USER PROFILE
  // ======================================================

  /**
   * GET /auth/me
   * Returns the currently authenticated user.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile (password omitted)' })
  getProfile(@Req() req: RequestWithUser) {
    const { password, ...profile } = req.user as any;
    return profile;
  }

  // ======================================================
  //  TIER-BASED ACCESS
  // ======================================================

  /**
   * GET /auth/premium-data
   * Example endpoint restricted to GOLD tier users only.
   */
  @Get('premium-data')
  @UseGuards(JwtAuthGuard, TierGuard)
  @Tier(AgentTier.GOLD)
  getPremiumData(@Req() req: RequestWithUser) {
    return {
      message: `Welcome, ${req.user.pharmacyName}! Here is your premium data.`,
    };
  }

  // ======================================================
  //  OAUTH – GOOGLE
  // ======================================================

  /**
   * GET /auth/google
   * Redirects the user to Google OAuth login.
   */
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  /**
   * GET /auth/google/callback
   * Handles Google OAuth callback and issues local JWT.
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: RequestWithUser, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  // ======================================================
  //  OAUTH – FACEBOOK
  // ======================================================

  /**
   * GET /auth/facebook
   * Redirects the user to Facebook OAuth login.
   */
  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  facebookAuth() {}

  /**
   * GET /auth/facebook/callback
   * Handles Facebook OAuth callback and issues local JWT.
   */
  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookCallback(@Req() req: RequestWithUser, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  // ======================================================
  //  SHARED OAUTH HANDLER
  // ======================================================

  /**
   * Issues JWT tokens after a successful OAuth login
   * and stores the access token inside an HTTP-only cookie.
   */
  private async handleOAuthCallback(req: RequestWithUser, res: Response) {
    const { accessToken } = await this.authService.issueTokens(req.user);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(
      `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`,
    );
  }
}
