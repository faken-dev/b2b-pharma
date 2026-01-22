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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { AgentTier } from './enum/agent-tier.enum';
import { Tier } from './decorator/tier.decorator';
import { TierGuard } from './guard/tier.guard';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { AuthGuard } from '@nestjs/passport';

interface RequestWithUser extends Request {
  user: any;
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
   * POST /auth/login
   * Authenticates user credentials and returns JWT tokens.
   */
  @Post('login')
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

  // ======================================================
  //  USER PROFILE
  // ======================================================

  /**
   * GET /auth/me
   * Returns the currently authenticated user.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Req() req: RequestWithUser) {
    return req.user;
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
