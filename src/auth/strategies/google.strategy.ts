import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { OAuthUserDto } from '../dto/oauth-user.dto';
import { AuthProvider } from '../enum/auth-provider.enum';
import { Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL:
        `${configService.get<string>('OAUTH_CALLBACK_URL')}!` +
        '/google/callback',
      scope: ['email', 'profile'],
    });
  }

  /**
   * `profile` is the Google user object.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        throw new UnauthorizedException('Google profile has no e‑mail');
      }

      // Build the DTO that our AuthService expects
      const oauthDto = new OAuthUserDto();
      oauthDto.email = email;
      oauthDto.pharmacyName = profile.displayName || email;
      oauthDto.provider = AuthProvider.GOOGLE;
      oauthDto.providerId = profile.id; // Google “sub”

      // Find existing or create a new user
      const existing = await this.authService.findByEmail(email);
      const user = existing
        ? existing
        : await this.authService.createUserFromOAuth(oauthDto);

      this.logger.log(`Google login → ${email} (userId=${user.id})`);
      done(null, user);
    } catch (err) {
      this.logger.error(`GoogleStrategy error: ${(err as Error).message}`);
      done(err, false);
    }
  }
}
