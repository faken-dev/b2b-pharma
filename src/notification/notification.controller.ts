import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { SendVerificationDto } from './dto/send-verification.dto';

@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Test endpoint:
   * POST /notification/verify
   * Body: { "email": "...", "token": "..." }
   */
  @Post('verify')
  @HttpCode(HttpStatus.CREATED) // 201 – the response interceptor will wrap it
  async sendVerification(@Body() dto: SendVerificationDto) {
    await this.notificationService.sendVerificationEmail(dto.email, dto.token);
    return { message: 'Verification email sent' };
  }
}
