import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendVerificationDto {
  @ApiProperty({ example: 'pharmacy@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'random-token-123' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
