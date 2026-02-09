import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeSessionDto {
  @ApiProperty({ description: 'Session ID to revoke' })
  @IsUUID()
  sessionId: string;
}
