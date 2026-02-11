import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Simple DTO that represents the ?token=… query‑parameter.
 */
export class VerifyEmailDto {
  @ApiProperty({
    description: 'JWT verification token that was sent by email',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Verification token must be provided' })
  token: string;
}
