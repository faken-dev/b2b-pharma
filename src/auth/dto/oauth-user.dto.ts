import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider } from '../enum/auth-provider.enum';

export class OAuthUserDto {
  @ApiProperty({ description: 'Verified e‑mail returned by the provider' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Display name from the provider' })
  @IsString()
  @IsNotEmpty()
  pharmacyName: string;

  @ApiProperty({ enum: AuthProvider })
  @IsEnum(AuthProvider)
  provider: AuthProvider;

  @ApiProperty({
    description: 'Provider‑specific ID (Google sub, Facebook id)',
  })
  @IsString()
  @IsNotEmpty()
  providerId: string;
}
