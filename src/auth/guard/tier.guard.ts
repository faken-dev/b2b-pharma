import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentTier } from '../enum/agent-tier.enum';
import { Request } from 'express';
import { User } from '../entities/user.entity';

// Custom metadata key
export const TIER_META_KEY = 'requiredTier';

@Injectable()
export class TierGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTier = this.reflector.get<AgentTier>(
      TIER_META_KEY,
      context.getHandler(),
    );

    if (!requiredTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User;

    if (!user?.agentTier) {
      throw new ForbiddenException('User tier information missing');
    }

    const tierOrder = {
      [AgentTier.BRONZE]: 0,
      [AgentTier.SILVER]: 1,
      [AgentTier.GOLD]: 2,
    };

    if (tierOrder[user.agentTier] < tierOrder[requiredTier]) {
      throw new ForbiddenException(
        `Access requires at least ${requiredTier} tier`,
      );
    }

    return true;
  }
}
