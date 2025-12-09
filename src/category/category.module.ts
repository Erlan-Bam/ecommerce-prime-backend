import { Module } from '@nestjs/common';
import { CategoryService } from './services/category.service';
import { CategoryController } from './category.controller';
import { CategoryCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [CategoryController],
  providers: [CategoryService, CategoryCacheService],
})
export class CategoryModule {}
