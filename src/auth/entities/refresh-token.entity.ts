import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Each row represents a refresh token that belongs to a user.
 * The actual token value is stored as a bcrypt hash for security.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Hash of the raw refresh token (bcrypt). */
  @Column()
  tokenHash: string;

  /** The token becomes invalid after this date (UTC). */
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /** The token may be manually revoked (e.g., logout). */
  @Column({ default: false })
  revoked: boolean;

  /** Time of creation – useful for audit. */
  @CreateDateColumn()
  createdAt: Date;

  /** Time of last update – not used now but kept for future features. */
  @UpdateDateColumn()
  updatedAt: Date;

  // -------------------------------------------------
  // SESSION MANAGEMENT FIELDS - ADD THESE
  // -------------------------------------------------

  /** Optional metadata about the device/session where the token is used. */
  @Column({ length: 100, nullable: true })
  deviceName?: string;

  /** Device type (e.g., "mobile", "desktop", "tablet"). */
  @Column({ length: 50, nullable: true })
  deviceType?: string;

  /** User agent string of the device/browser. */
  @Column({ length: 255, nullable: true })
  userAgent?: string;

  /** IP address from which the token was issued. */
  @Column({ length: 45, nullable: true })
  ipAddress?: string;

  /** Geographical location info (e.g., city, country). */
  @Column({ length: 100, nullable: true })
  location?: string;

  /** Indicates if the session is currently active. */
  @Column({ default: true })
  isActive: boolean;

  /** Relation – many refresh tokens can belong to one user. */
  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @Index()
  user: User;
}
