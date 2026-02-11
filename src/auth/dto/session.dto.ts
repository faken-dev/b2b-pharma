import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty({ description: 'Session/refresh token ID' })
  id: string;

  @ApiProperty({
    description: 'Device name (e.g., iPhone 15, Chrome on Windows)',
  })
  deviceName: string;

  @ApiProperty({ description: 'Device type (mobile, desktop, tablet)' })
  deviceType: string;

  @ApiProperty({ description: 'Location detected from IP address' })
  location: string;

  @ApiProperty({ description: 'IP address' })
  ipAddress: string;

  @ApiProperty({ description: 'When the session was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the session was last used' })
  lastActive: Date;

  @ApiProperty({ description: 'Is this the current session?' })
  isCurrent: boolean;
}

export class SessionListDto {
  @ApiProperty({ type: [SessionDto] })
  sessions: SessionDto[];

  @ApiProperty({ description: 'Total active sessions' })
  total: number;
}
