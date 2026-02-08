import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        response.setHeader('X-RateLimit-Limit', '5');
        response.setHeader('X-RateLimit-Remaining', '4');
        response.setHeader(
          'X-RateLimit-Reset',
          Math.floor(Date.now() / 1000) + 60,
        );
      }),
    );
  }
}
