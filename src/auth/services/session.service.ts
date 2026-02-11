import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { SessionListDto } from '../dto/session.dto';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly auditService: AuditService,
  ) {}

  // ========================================================================
  // SESSION QUERIES
  // ========================================================================

  /**
   * Get all active sessions for user
   */
  async getSessions(user: User): Promise<SessionListDto> {
    const sessions = await this.refreshTokenRepo.find({
      where: {
        user: { id: user.id },
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    const sessionDtos = sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName || 'Unknown Device',
      deviceType: session.deviceType || 'unknown',
      location: session.location || 'Unknown',
      ipAddress: session.ipAddress || 'Unknown',
      createdAt: session.createdAt,
      lastActive: session.updatedAt,
      isCurrent: false,
    }));

    return {
      sessions: sessionDtos,
      total: sessionDtos.length,
    };
  }

  // ========================================================================
  // SESSION REVOCATION
  // ========================================================================

  /**
   * Revoke specific session
   */
  async revokeSession(user: User, sessionId: string): Promise<void> {
    const session = await this.refreshTokenRepo.findOne({
      where: { id: sessionId, user: { id: user.id } },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    session.revoked = true;
    await this.refreshTokenRepo.save(session);

    this.logger.log(`Session ${sessionId} revoked for user ${user.id}`);

    await this.auditService.logSuccess(AuditAction.LOGOUT, {
      user,
      description: `Session revoked: ${session.deviceName}`,
      metadata: { sessionId, deviceName: session.deviceName },
    });
  }

  /**
   * Revoke all sessions except current
   */
  async revokeOtherSessions(
    user: User,
    currentSessionId: string,
  ): Promise<void> {
    const sessions = await this.refreshTokenRepo.find({
      where: {
        user: { id: user.id },
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });

    let revokedCount = 0;
    for (const session of sessions) {
      if (session.id !== currentSessionId) {
        session.revoked = true;
        await this.refreshTokenRepo.save(session);
        revokedCount++;
      }
    }

    this.logger.log(
      `${revokedCount} other sessions revoked for user ${user.id}`,
    );

    await this.auditService.logSuccess(AuditAction.LOGOUT, {
      user,
      description: 'All other sessions revoked',
      metadata: { sessionsRevoked: revokedCount },
    });
  }

  /**
   * Revoke all sessions for user
   */
  async revokeAllSessions(user: User): Promise<number> {
    const sessions = await this.refreshTokenRepo.find({
      where: { user: { id: user.id }, revoked: false },
    });

    for (const session of sessions) {
      session.revoked = true;
    }

    await this.refreshTokenRepo.save(sessions);

    this.logger.log(
      `All ${sessions.length} sessions revoked for user ${user.id}`,
    );

    await this.auditService.logSuccess(AuditAction.LOGOUT, {
      user,
      description: 'Logout from all devices',
      metadata: { sessionsRevoked: sessions.length },
    });

    return sessions.length;
  }

  // ========================================================================
  // SESSION CLEANUP
  // ========================================================================

  /**
   * Clean up expired sessions (cron job)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();

    const deletedCount = result.affected || 0;
    this.logger.log(`Cleaned up ${deletedCount} expired sessions`);

    return deletedCount;
  }

  /**
   * Clean up revoked sessions older than specified days
   */
  async cleanupRevokedSessions(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.refreshTokenRepo
      .createQueryBuilder()
      .delete()
      .where('revoked = :revoked', { revoked: true })
      .andWhere('updatedAt < :cutoffDate', { cutoffDate })
      .execute();

    const deletedCount = result.affected || 0;
    this.logger.log(
      `Cleaned up ${deletedCount} revoked sessions older than ${olderThanDays} days`,
    );

    return deletedCount;
  }
}
