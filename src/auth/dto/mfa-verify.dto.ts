import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaVerifyDto {
  @ApiProperty({
    description: '6-digit TOTP code from authenticator app',
    example: '123456',
  })
  @IsString()
  @Length(6, 6, { message: 'MFA code must be 6 digits' })
  code: string;
}
