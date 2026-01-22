import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { AgentTier } from './enum/agent-tier.enum';
import { Tier } from './decorator/tier.decorator';
import { TierGuard } from './guard/tier.guard';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Returns the newly created user (password stripped out) wrapped by the
   * global TransformInterceptor:
   * {
   *   "statusCode": 201,
   *   "message": "Success",
   *   "data": { … }
   * }
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED) // 201
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * GET /auth/verify?token=...
   * The token is the JWT that was emailed during registration.
   *
   * Returns:
   *   {
   *     "statusCode": 200,
   *     "message": "Success",
   *     "data": { "message": "...verified..." }
   *   }
   */
  @Get('verify')
  @ApiOperation({ summary: 'Verify e‑mail address using token' })
  @ApiResponse({ status: 200, description: 'Verification result' })
  async verify(@Query() query: VerifyEmailDto) {
    return this.authService.verifyEmail(query.token);
  }

  /**
   * POST /auth/login
   * Returns an `{ accessToken: string }` payload.
   */
  @Post('login')
  @ApiOperation({ summary: 'Login with e‑mail & password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful (access token returned)',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or unverified account',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * GET /auth/me
   * A demo protected route that returns the current user (without password).
   * Use the Authorization header:  Bearer <accessToken>
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, description: 'Authenticated user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  getProfile(@Request() req) {
    // The JwtStrategy placed the user object on req.user
    return req.user;
  }

  /**
   * Example endpoint – only GOLD tier can access.
   * In a real B2B system this could return premium pricing data.
   */
  @Get('premium-data')
  @UseGuards(JwtAuthGuard, TierGuard) // both JWT + tier guard
  @Tier(AgentTier.GOLD)
  @ApiOperation({ summary: 'Get premium data (GOLD tier only)' })
  getPremiumData(@Request() req) {
    return {
      message: `Welcome, ${req.user.pharmacyName}! Here is your premium data.`,
    };
  }

  /**
   * Refresh access token using a valid refresh token.
   * Returns a new pair { accessToken, refreshToken }.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT pair using a refresh token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto);
  }

  /**
   * Log out by revoking the supplied refresh token.
   * The client should delete its stored tokens after a successful call.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout – invalidate a refresh token' })
  logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto);
  }

  /**
   * POST /auth/forgot-password
   * Fires a password‑reset e‑mail (if the address exists).
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password‑reset link via e‑mail' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  /**
   * POST /auth/reset-password
   * Consumes the token from the e‑mail and sets a new password.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from e‑mail' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
