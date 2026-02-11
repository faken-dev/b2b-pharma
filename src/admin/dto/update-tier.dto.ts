import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AgentTier } from '../../auth/enum/agent-tier.enum';

export class UpdateTierDto {
  @ApiProperty({ enum: AgentTier })
  @IsEnum(AgentTier)
  agentTier: AgentTier;
}
