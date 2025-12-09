import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { BrandCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [BrandController],
  providers: [BrandService, BrandCacheService],
  exports: [BrandService],
})
export class BrandModule {}
