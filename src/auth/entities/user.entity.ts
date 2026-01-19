import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
import { AgentTier } from '../enum/agent-tier.enum';

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
}
