import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchDto } from './dto';
import { Public } from '../shared/decorator/public.decorator';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('autocomplete')
  @ApiOperation({ summary: 'Get search suggestions (autocomplete)' })
  @ApiResponse({
    status: 200,
    description: 'Suggestions retrieved successfully',
  })
  autocomplete(@Query() dto: SearchDto) {
    return this.searchService.autocomplete(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Search products' })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully',
  })
  search(@Query() dto: SearchDto) {
    return this.searchService.search(dto);
  }

  @Public()
  @Get('popular')
  @ApiOperation({ summary: 'Get popular search terms' })
  @ApiResponse({
    status: 200,
    description: 'Popular searches retrieved successfully',
  })
  getPopular() {
    return this.searchService.getPopularSearches();
  }
}
