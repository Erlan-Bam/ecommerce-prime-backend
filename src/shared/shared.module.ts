import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './services/prisma.service';
import { CronService } from './services/cron.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { BotService } from './services/bot.service';
import { ZephyrService } from './services/zephyr.service';
import { TronService } from './services/tron.service';
import { TransactionModule } from 'src/transaction/transaction.module';
import { MaintenanceService } from './services/maintenance.service';

@Global()
@Module({
  imports: [ConfigModule, JwtModule.register({}), TransactionModule],
  providers: [
    PrismaService,
    BotService,
    ZephyrService,
    TronService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
  ],
  exports: [
    PrismaService,
    BotService,
    ZephyrService,
    TronService,
    CronService,
    JwtStrategy,
    JwtService,
    MaintenanceService,
  ],
})
export class SharedModule {}
