import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../shared/services/prisma.service';
import { SharedModule } from '../shared/shared.module';
import { CategoryCacheService } from '../category/services/cache.service';
import { ProductCacheService } from '../product/services/cache.service';

@Module({
  imports: [SharedModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    PrismaService,
    CategoryCacheService,
    ProductCacheService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
