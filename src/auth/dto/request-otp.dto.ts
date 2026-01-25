import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OneTimeTokenType } from '../enum/one-time-token-type';

export class RequestOtpDto {
  @ApiProperty({ example: '+84912345678' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  /**
   * Optional – defaults to PHONE_VERIFICATION.
   * If you pass PASSWORD_RESET the OTP will be used for a password reset flow for just phone login user.
   */
  @ApiProperty({
    description: 'Type of OTP you request (default PHONE_VERIFICATION)',
    enum: OneTimeTokenType,
    required: false,
  })
  @IsOptional()
  type?: OneTimeTokenType;
}
