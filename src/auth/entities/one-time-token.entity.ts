import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { OneTimeTokenType } from '../enum/one-time-token-type';

/**
 * Stores a **hashed OTP**
 * `type` determines the purpose (email verification, phone verification, password reset).
 */
@Entity('one_time_tokens')
export class OneTimeToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({
    type: 'enum',
    enum: OneTimeTokenType,
  })
  type: OneTimeTokenType;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @Index()
  user: User;
}
