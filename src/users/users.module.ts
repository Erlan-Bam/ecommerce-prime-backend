import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './controllers/users.controller';
import { AdminController } from './controllers/admin.controller';
import { PrismaService } from '../shared/services/prisma.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [UsersController, AdminController],
  providers: [UsersService, PrismaService],
  exports: [UsersService],
})
export class UsersModule {}
