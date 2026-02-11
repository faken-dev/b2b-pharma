import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OneTimeTokenType } from '../enum/one-time-token-type';

export class VerifyOtpDto {
  @ApiProperty({ example: '+84912345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({
    example: 'a1b2c3',
    description: 'OTP code (plain, as received via SMS)',
  })
  @IsString()
  @Length(4, 8)
  otp: string;

  @ApiProperty({
    description: 'Type of OTP you are verifying (default PHONE_VERIFICATION)',
    enum: OneTimeTokenType,
    required: false,
  })
  @IsOptional()
  type?: OneTimeTokenType;
}
