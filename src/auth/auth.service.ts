import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { NotificationService } from '../notification/notification.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationService: NotificationService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new pharmacy/agent.
   * – Throws BadRequestException if e‑mail already exists.
   * – Returns the created user **without** the password field.
   */
  async register(dto: RegisterDto) {
    // Check e‑mail uniqueness
    const exists = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (exists) {
      this.logger.warn(`Registration attempt with used e‑mail: ${dto.email}`);
      throw new BadRequestException('E‑mail already registered');
    }

    // Hash the password (bcrypt, cost = 10)
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create & persist the user (agentTier defaults to BRONZE, isVerified false)
    const newUser = this.userRepo.create({
      email: dto.email,
      password: hashedPassword,
      pharmacyName: dto.pharmacyName,
      businessLicense: dto.businessLicense,
    });
    const savedUser = await this.userRepo.save(newUser);

    // Create a verification JWT (expires in 24h)
    const token = await this.jwtService.signAsync(
      {
        sub: savedUser.id,
        email: savedUser.email,
      },
      { expiresIn: '24h' },
    );

    // Send the verification e‑mail
    try {
      await this.notificationService.sendVerificationEmail(
        savedUser.email,
        token,
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to send verification email to ${savedUser.email}: ${errMsg}`,
      );
      throw err;
    }

    // Return the user without the password field
    const { password: _password, ...userWithoutPassword } = savedUser;
    return userWithoutPassword;
  }
}
