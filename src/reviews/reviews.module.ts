import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './services/reviews.service';
import { ReviewsCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsCacheService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
