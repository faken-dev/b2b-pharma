import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

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
}
