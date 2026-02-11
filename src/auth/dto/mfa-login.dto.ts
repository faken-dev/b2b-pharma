import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaLoginDto {
  @ApiProperty({
    description: 'Email or phone number',
    example: 'pharmacy@example.com or +84912345678',
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ example: 'StrongP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: '6-digit MFA code (required if MFA enabled)',
    example: '123456',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'MFA code must be 6 digits' })
  code?: string;
}
