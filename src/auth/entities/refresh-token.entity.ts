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

  /** Relation – many refresh tokens can belong to one user. */
  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @Index()
  user: User;
}
