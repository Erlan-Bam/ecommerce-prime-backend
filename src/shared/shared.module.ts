import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './services/prisma.service';
import { CronService } from './services/cron.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MaintenanceService } from './services/maintenance.service';
import { RedisService } from './services/redis.service';

@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [
    PrismaService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
    RedisService,
  ],
  exports: [
    PrismaService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
    RedisService,
  ],
})
export class SharedModule {}
