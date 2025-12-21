import { Module } from '@nestjs/common';
import { BlogController } from './blog.controller';
import { BlogService, BlogCacheService } from './services';

@Module({
  controllers: [BlogController],
  providers: [BlogService, BlogCacheService],
  exports: [BlogService],
})
export class BlogModule {}
