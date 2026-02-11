import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AuditAction } from './entities/audit-log.entity';
import type { Request } from 'express';
import { User } from '../auth/entities/user.entity';

interface RequestWithUser extends Request {
  user?: User;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const startTime = Date.now();

    const { method, url, user, ip, headers } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.logSuccess(method, url, user, ip, headers, startTime);
        },
        error: (error: unknown) => {
          void this.logError(method, url, user, ip, headers, startTime, error);
        },
      }),
    );
  }

  private async logSuccess(
    method: string,
    url: string,
    user: User | undefined,
    ip: string | undefined,
    headers: Request['headers'],
    startTime: number,
  ): Promise<void> {
    const duration = Date.now() - startTime;

    const action = this.getActionFromMethodAndUrl(method, url);
    if (!action) return;

    await this.auditService.logSuccess(action, {
      user,
      userId: user?.id,
      description: `${method} ${url} - ${duration}ms`,
      metadata: {
        method,
        url,
        duration,
        userAgent: headers['user-agent'],
      },
      ipAddress: ip,
      userAgent: headers['user-agent'],
    });
  }

  private async logError(
    method: string,
    url: string,
    user: User | undefined,
    ip: string | undefined,
    headers: Request['headers'],
    startTime: number,
    error: unknown,
  ): Promise<void> {
    const duration = Date.now() - startTime;

    const action = this.getActionFromMethodAndUrl(method, url);
    if (!action) return;

    const err = error as {
      message?: string;
      status?: number;
    };

    await this.auditService.logFailure(action, {
      user,
      userId: user?.id,
      description: `${method} ${url} - ${err.message ?? 'Unknown error'} - ${duration}ms`,
      metadata: {
        method,
        url,
        duration,
        error: err.message,
        statusCode: err.status,
        userAgent: headers['user-agent'],
      },
      ipAddress: ip,
      userAgent: headers['user-agent'],
    });
  }

  private getActionFromMethodAndUrl(
    method: string,
    url: string,
  ): AuditAction | null {
    if (url.includes('/auth/login') && method === 'POST') {
      return AuditAction.LOGIN_SUCCESS;
    }

    if (url.includes('/auth/register')) {
      return AuditAction.REGISTER;
    }

    if (url.includes('/auth/verify-email')) {
      return AuditAction.EMAIL_VERIFIED;
    }

    if (url.includes('/auth/otp/verify')) {
      return AuditAction.PHONE_VERIFIED;
    }

    if (url.includes('/auth/mfa/setup')) {
      return AuditAction.MFA_SETUP;
    }

    if (url.includes('/auth/mfa/verify-setup')) {
      return AuditAction.MFA_VERIFIED;
    }

    if (url.includes('/auth/mfa/disable')) {
      return AuditAction.MFA_DISABLED;
    }

    return null;
  }
}
