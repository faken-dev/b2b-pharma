import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.extractMessage(exception);

    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';

    if (nodeEnv !== 'production') {
      this.logger.error(
        `${request.method} ${request.url}`,
        this.buildDevLog(status, message, exception),
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url}`,
        `${status} - ${message}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      data: null,
    });
  }

  // ---------- helpers ----------

  private extractMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();

      if (typeof res === 'string') {
        return res;
      }

      if (typeof res === 'object' && res !== null && 'message' in res) {
        const msg = (res as { message?: unknown }).message;
        return Array.isArray(msg) ? msg.join(', ') : String(msg);
      }
    }

    return 'Internal server error';
  }

  private buildDevLog(
    status: number,
    message: string,
    exception: unknown,
  ): string {
    const stack =
      exception instanceof Error && exception.stack ? exception.stack : '';

    return `${status} - ${message}\n${stack}`;
  }
}
