import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  OneToMany,
} from 'typeorm';
import { AgentTier } from '../enum/agent-tier.enum';
import { RefreshToken } from './refresh-token.entity';
import { Role } from '../enum/role.enum';
import { AuthProvider } from '../enum/auth-provider.enum';
import { PasswordResetToken } from './password-reset-token.entity';

/**
 * Represents a Pharmacy or an Agent in the PharmaB2B system.
 * All fields are persisted in the "users" table.
 */
@Entity('users')
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Login e‑mail – unique, required */
  @Column({ length: 255 })
  email: string;

  /** Hashed password */
  @Column()
  password: string;

  /** Human‑readable pharmacy/agent name */
  @Column({ length: 255 })
  pharmacyName: string;

  /** Business license number – “Mã số thuế” */
  @Column({ length: 50 })
  businessLicense: string;

  /** Tier of the agent – defaults to BRONZE */
  @Column({
    type: 'enum',
    enum: AgentTier,
    default: AgentTier.BRONZE,
  })
  agentTier: AgentTier;

  /** Has the user verified the e‑mail address? */
  @Column({ default: false })
  isVerified: boolean;

  /** Role of the account – default USER */
  @Column({
    type: 'enum',
    enum: Role,
    default: Role.USER,
  })
  role: Role;

  /** Authentication provider (LOCAL, GOOGLE, FACEBOOK) */
  @Column({
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.LOCAL,
  })
  authProvider: AuthProvider;

  /**
   * Provider‑specific ID (e.g., Google `sub` or Facebook `id`).
   * Null for LOCAL accounts.  Adding a unique index on this column + provider
   * lets you quickly detect duplicate social accounts.
   */
  @Column({ type: 'varchar', nullable: true })
  providerId?: string;

  // ---------------------------------------------------------------------
  // Relations
  // ---------------------------------------------------------------------

  /** Refresh tokens issued to this user */
  @OneToMany(() => RefreshToken, (rt) => rt.user, { cascade: true })
  refreshTokens: RefreshToken[];

  /** Password reset tokens issued to this user */
  @OneToMany(() => PasswordResetToken, (prt) => prt.user, { cascade: true })
  passwordResetTokens: PasswordResetToken[];
}
