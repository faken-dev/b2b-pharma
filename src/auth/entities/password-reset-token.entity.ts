import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * One row = one password‑reset request.
 * The raw token is **never stored** – Keep only a bcrypt hash.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** bcrypt hash of the raw token (80‑char hex string) */
  @Column()
  tokenHash: string;

  /** When the token becomes invalid */
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /** Marked true once the token is used (prevents replay) */
  @Column({ default: false })
  used: boolean;

  @CreateDateColumn()
  createdAt: Date;

  /** Owner of the token */
  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @Index()
  user: User;
}
