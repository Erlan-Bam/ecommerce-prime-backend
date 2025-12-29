import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductCacheService } from './services/cache.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [ProductController, ReviewsController],
  providers: [ProductService, ProductCacheService, ReviewsService],
  exports: [ProductService],
})
export class ProductModule {}
