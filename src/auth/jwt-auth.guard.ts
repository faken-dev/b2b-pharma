import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guards routes that require a valid JWT.
 * Usage: @UseGuards(JwtAuthGuard) on controller methods.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
