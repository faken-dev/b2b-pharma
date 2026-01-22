import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Roles } from 'src/auth/guard/roles.decorator';
import { RoleGuard } from 'src/auth/guard/role.guard';
import { Role } from 'src/auth/enum/role.enum';
import { User } from 'src/auth/entities/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UpdateTierDto } from './dto/update-tier.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RoleGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** List *all* users (agents & pharmacies) */
  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all users (admin only)' })
  async listUsers() {
    const users = await this.userRepo.find();
    return users.map(({ password: _password, ...rest }) => rest);
  }

  /**
   * Update an agent’s tier.
   * Example: PATCH /admin/users/<id>/tier  { "agentTier": "GOLD" }
   */
  @Patch('users/:id/tier')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an agent’s tier (admin only)' })
  async updateTier(@Param('id') id: string, @Body() dto: UpdateTierDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    user.agentTier = dto.agentTier;
    await this.userRepo.save(user);
    const { password: _password, ...rest } = user;
    return rest;
  }
}
