import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchCacheService } from './services/cache.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [SearchController],
  providers: [SearchService, SearchCacheService],
  exports: [SearchService],
})
export class SearchModule {}
