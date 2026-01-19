import * as winston from 'winston';

/**
 * Returns a Winston format that prints:
 *   2026-01-19T14:22:33.123Z [Context] level: message
 */
export const winstonConsoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf((info) => {
    const { timestamp, level, message, context } = info as {
      timestamp: string;
      level: string;
      message: unknown;
      context?: string;
    };

    const ctx = context ? `[${context}] ` : '';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);

    return `${timestamp} ${ctx}${level}: ${msg}`;
  }),
);
