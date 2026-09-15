import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { BlogController } from './blog.controller';
import { BlogAuthorController } from './blog-author.controller';
import { BlogService, BlogCacheService, BlogAuthorService } from './services';

@Module({
  imports: [SharedModule],
  controllers: [BlogController, BlogAuthorController],
  providers: [BlogService, BlogCacheService, BlogAuthorService],
  exports: [BlogService, BlogAuthorService],
})
export class BlogModule {}
