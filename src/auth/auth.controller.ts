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
import { JwtAuthGuard } from './jwt-auth.guard';
import { AgentTier } from './enum/agent-tier.enum';
import { Tier } from './tier.decorator';
import { TierGuard } from './tier.guard';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
    return this.authService.login(loginDto.email, loginDto.password);
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
}
