import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',

  // Registration & Verification
  REGISTER = 'REGISTER',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  PHONE_VERIFIED = 'PHONE_VERIFIED',

  // MFA events
  MFA_SETUP = 'MFA_SETUP',
  MFA_VERIFIED = 'MFA_VERIFIED',
  MFA_DISABLED = 'MFA_DISABLED',
  MFA_FAILED = 'MFA_FAILED',

  // Password events
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET = 'PASSWORD_RESET',

  // Profile events
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  TIER_CHANGED = 'TIER_CHANGED',

  // Security events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
}

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  PENDING = 'PENDING',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditResult,
    default: AuditResult.SUCCESS,
  })
  result: AuditResult;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: any;

  @Column({ length: 45, nullable: true })
  ipAddress?: string;

  @Column({ length: 500, nullable: true })
  userAgent?: string;

  @CreateDateColumn()
  timestamp: Date;

  @ManyToOne(() => User, { nullable: true })
  @Index()
  user?: User;

  @Column({ nullable: true })
  userId?: string;
}
