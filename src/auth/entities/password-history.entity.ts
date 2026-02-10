import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('password_history')
export class PasswordHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @Index()
  user: User;

  @Column()
  userId: string;
}
