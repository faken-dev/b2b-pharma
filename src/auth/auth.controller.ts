import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthService } from './auth.service';
import { ApiTags } from '@nestjs/swagger';

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
}
