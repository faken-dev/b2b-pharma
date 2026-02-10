import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SecurityConfig {
  corsOrigin: string;
  hstsMaxAge: number;
  contentSecurityPolicy: boolean;
  permittedCrossDomainPolicies: boolean;
  referrerPolicy: string;
}

@Injectable()
export class SecurityConfigService {
  constructor(private configService: ConfigService) {}

  get securityConfig(): SecurityConfig {
    return {
      corsOrigin:
        this.configService.get<string>('CORS_ORIGIN') ||
        'http://localhost:3000',
      hstsMaxAge: this.configService.get<number>('HSTS_MAX_AGE') || 31536000,
      contentSecurityPolicy:
        this.configService.get<boolean>('CSP_ENABLED') ?? true,
      permittedCrossDomainPolicies:
        this.configService.get<boolean>('PERMITTED_CROSS_DOMAIN') ?? true,
      referrerPolicy:
        this.configService.get<string>('REFERRER_POLICY') ||
        'strict-origin-when-cross-origin',
    };
  }

  get helmetConfig() {
    const config = this.securityConfig;

    return {
      contentSecurityPolicy: config.contentSecurityPolicy
        ? {
            directives: {
              defaultSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              scriptSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,

      hsts: {
        maxAge: config.hstsMaxAge,
        includeSubDomains: true,
        preload: true,
      },

      permittedCrossDomainPolicies: config.permittedCrossDomainPolicies,
      referrerPolicy: { policy: config.referrerPolicy },
    };
  }
}
