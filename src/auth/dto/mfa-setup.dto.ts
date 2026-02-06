import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MfaSetupDto {
  @ApiProperty({
    description: 'Current password to confirm MFA setup',
    example: 'CurrentP@ssw0rd123!',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}
