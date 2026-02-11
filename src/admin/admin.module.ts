import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AdminController } from './admin.controller';
import { RoleGuard } from '../auth/guard/role.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AdminController],
  providers: [RoleGuard],
})
export class AdminModule {}
