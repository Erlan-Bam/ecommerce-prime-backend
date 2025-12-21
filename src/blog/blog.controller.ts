import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { BlogService } from './services';
import { CreateBlogDto, UpdateBlogDto } from './dto';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Public } from '../shared/decorator/public.decorator';
import { PaginationDto } from '../shared/dto/pagination.dto';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  // Public endpoints
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all published blog posts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Blog posts retrieved successfully',
  })
  async findAll(@Query() pagination: PaginationDto) {
    return this.blogService.findAll(pagination);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get blog post by slug' })
  @ApiResponse({
    status: 200,
    description: 'Blog post retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Blog post not found',
  })
  async findBySlug(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }

  // Admin endpoints
  @UseGuards(AdminGuard)
  @Get('admin/all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all blog posts (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'All blog posts retrieved successfully',
  })
  async findAllAdmin(@Query() pagination: PaginationDto) {
    return this.blogService.findAllAdmin(pagination);
  }

  @UseGuards(AdminGuard)
  @Get('admin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get blog post by ID (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Blog post retrieved successfully',
  })
  async findById(@Param('id') id: string) {
    return this.blogService.findById(id);
  }

  @UseGuards(AdminGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new blog post (admin)' })
  @ApiResponse({
    status: 201,
    description: 'Blog post created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  async create(@Body() dto: CreateBlogDto) {
    return this.blogService.create(dto);
  }

  @UseGuards(AdminGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a blog post (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Blog post updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Blog post not found',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateBlogDto) {
    return this.blogService.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a blog post (admin)' })
  @ApiResponse({
    status: 204,
    description: 'Blog post deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Blog post not found',
  })
  async delete(@Param('id') id: string) {
    return this.blogService.delete(id);
  }
}
