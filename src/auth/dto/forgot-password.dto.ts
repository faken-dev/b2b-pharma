import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, ValidateIf } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'pharmacy@example.com',
    required: false,
  })
  @ValidateIf((o: ForgotPasswordDto) => o.email !== undefined)
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  @ApiProperty({
    example: '+84912345678',
    required: false,
  })
  @ValidateIf((o: ForgotPasswordDto) => o.phoneNumber !== undefined)
  @IsString()
  @Matches(/^\+\d{8,15}$/, {
    message: 'Phone number must be in E.164 format, e.g. +84912345678',
  })
  phoneNumber?: string;
}
