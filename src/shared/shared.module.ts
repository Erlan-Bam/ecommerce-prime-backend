import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './services/prisma.service';
import { CronService } from './services/cron.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MaintenanceService } from './services/maintenance.service';

@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [
    PrismaService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
  ],
  exports: [
    PrismaService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
  ],
})
export class SharedModule {}
