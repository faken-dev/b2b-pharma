import { SetMetadata } from '@nestjs/common';
import { AgentTier } from './enum/agent-tier.enum';
import { TIER_META_KEY } from './tier.guard';

export const Tier = (tier: AgentTier) => SetMetadata(TIER_META_KEY, tier);
