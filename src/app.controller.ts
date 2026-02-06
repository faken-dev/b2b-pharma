import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiOperation } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simple health check – returns "pong"' })
  ping() {
    return { message: 'pong' };
  }
}
