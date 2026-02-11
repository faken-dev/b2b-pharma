import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuditLog,
  AuditAction,
  AuditResult,
} from './entities/audit-log.entity';
import { User } from '../auth/entities/user.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit event with automatic timestamp and optional user context
   */
  async logEvent(
    action: AuditAction,
    result: AuditResult,
    options: {
      user?: User;
      userId?: string;
      description?: string;
      metadata?: any;
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ): Promise<void> {
    try {
      const auditLog = this.auditLogRepo.create({
        action,
        result,
        user: options.user || undefined,
        userId: options.user?.id || options.userId,
        description: options.description,
        metadata: options.metadata,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        timestamp: new Date(),
      });

      await this.auditLogRepo.save(auditLog);

      this.logger.log(`Audit event: ${action} - ${result}`);
    } catch (error) {
      this.logger.error(`Failed to log audit event: ${error.message}`);
    }
  }

  /**
   * Helper method for successful events
   */
  async logSuccess(
    action: AuditAction,
    options: {
      user?: User;
      userId?: string;
      description?: string;
      metadata?: any;
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ): Promise<void> {
    await this.logEvent(action, AuditResult.SUCCESS, options);
  }

  /**
   * Helper method for failed events
   */
  async logFailure(
    action: AuditAction,
    options: {
      user?: User;
      userId?: string;
      description?: string;
      metadata?: any;
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ): Promise<void> {
    await this.logEvent(action, AuditResult.FAILURE, options);
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(
    userId: string,
    limit: number = 50,
  ): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: { userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get recent security events (for dashboard/alerts)
   */
  async getRecentSecurityEvents(
    actions: AuditAction[],
    hours: number = 24,
  ): Promise<AuditLog[]> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    return this.auditLogRepo
      .createQueryBuilder('audit')
      .where('audit.action IN (:...actions)', { actions })
      .andWhere('audit.timestamp > :cutoff', { cutoff: cutoffTime })
      .orderBy('audit.timestamp', 'DESC')
      .getMany();
  }
}
