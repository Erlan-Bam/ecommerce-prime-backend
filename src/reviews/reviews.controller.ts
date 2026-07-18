import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
} from '@nestjs/common';
import { ReviewsService } from './services/reviews.service';
import { AdminGuard } from '../shared/guards/admin.guard';
import { UserGuard } from '../shared/guards/user.guard';
import { CreateReviewDto, CreateGuestReviewDto, UpdateReviewDto } from './dto';
import { ApiTags, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Review created successfully' })
  @ApiResponse({
    status: 409,
    description: 'You have already reviewed this product',
  })
  async create(@Request() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user.id, dto);
  }

  @Post('guest')
  @ApiResponse({
    status: 201,
    description: 'Guest review created successfully',
  })
  async createGuestReview(@Body() dto: CreateGuestReviewDto) {
    return this.reviewsService.createGuestReview(dto);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'productId', required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'rating', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'rating'],
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
  })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('productId') productId?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
    @Query('rating') rating?: string,
    @Query('sortBy') sortBy?: 'createdAt' | 'rating',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.reviewsService.findAll({
      page,
      limit,
      productId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
      rating: rating ? Number(rating) : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Review stats retrieved successfully',
  })
  async getStats() {
    return this.reviewsService.getStats();
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Review retrieved successfully' })
  async findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @Patch(':id/approve')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Review approved successfully' })
  async approve(@Param('id') id: string) {
    return this.reviewsService.approve(id);
  }

  @Patch(':id/reject')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Review rejected successfully' })
  async reject(@Param('id') id: string) {
    return this.reviewsService.reject(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Review updated successfully' })
  async update(@Param('id') id: string, @Body() dto: UpdateReviewDto) {
    return this.reviewsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Review deleted successfully' })
  async remove(@Param('id') id: string) {
    return this.reviewsService.remove(id);
  }
}
