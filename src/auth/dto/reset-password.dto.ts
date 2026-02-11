import { IsString, MinLength, Matches, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Raw reset token received by e‑mail' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description:
      'New password – 8‑32 chars, at least one upper, lower, number, special char',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])/, {
    message:
      'Password too weak – must contain upper, lower, number and special character',
  })
  newPassword: string;
}
