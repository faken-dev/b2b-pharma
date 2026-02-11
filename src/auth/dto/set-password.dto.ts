import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({
    description:
      'New password – 8‑32 chars, must contain upper, lower, number, special',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])/, {
    message:
      'Password too weak – must contain upper, lower, number and special character',
  })
  newPassword: string;
}
