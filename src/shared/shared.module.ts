import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './services/prisma.service';
import { CronService } from './services/cron.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { MaintenanceService } from './services/maintenance.service';
import { RedisService } from './services/redis.service';
import { SmsService } from './services/sms.service';

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
    SmsService,
  ],
  exports: [
    PrismaService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
    RedisService,
    SmsService,
  ],
})
export class SharedModule {}
