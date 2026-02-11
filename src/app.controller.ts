import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';

@Controller()
export class AppController {
  @Get('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simple health check – returns "pong"' })
  ping() {
    return { message: 'pong' };
  }
}
