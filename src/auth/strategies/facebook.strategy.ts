import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { OAuthUserDto } from '../dto/oauth-user.dto';
import { AuthProvider } from '../enum/auth-provider.enum';
import { Profile } from 'passport-google-oauth20';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  private readonly logger = new Logger(FacebookStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<string>('FACEBOOK_APP_ID')!,
      clientSecret: configService.get<string>('FACEBOOK_APP_SECRET')!,
      callbackURL:
        `${configService.get<string>('OAUTH_CALLBACK_URL')}!` +
        '/facebook/callback',
      profileFields: ['id', 'emails', 'displayName'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      throw new UnauthorizedException('Facebook profile has no e-mail');
    }

    const oauthDto = new OAuthUserDto();
    oauthDto.email = email;
    oauthDto.pharmacyName = profile.displayName || email;
    oauthDto.provider = AuthProvider.FACEBOOK;
    oauthDto.providerId = profile.id;

    const existing = await this.authService.findByEmail(email);

    const user = existing
      ? existing
      : await this.authService.createUserFromOAuth(oauthDto);

    this.logger.log(`Facebook login → ${email} (userId=${user.id})`);
    return user;
  }
}
