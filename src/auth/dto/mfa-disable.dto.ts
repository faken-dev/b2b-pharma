import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaDisableDto {
  @ApiProperty({
    description: 'Current password to disable MFA',
    example: 'CurrentP@ssw0rd123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'Backup code or current MFA code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
