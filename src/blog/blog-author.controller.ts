import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../shared/guards/admin.guard';
import { CreateBlogAuthorDto, UpdateBlogAuthorDto } from './dto/blog-author.dto';
import { BlogAuthorService } from './services/blog-author.service';

@ApiTags('Blog Authors')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('blog-authors')
export class BlogAuthorController {
  constructor(private readonly blogAuthorService: BlogAuthorService) {}

  @Get()
  @ApiOperation({ summary: 'Get blog authors (Admin)' })
  findAll() { return this.blogAuthorService.findAll(); }

  @Get(':id')
  @ApiOperation({ summary: 'Get blog author (Admin)' })
  findOne(@Param('id') id: string) { return this.blogAuthorService.findOne(id); }

  @Post()
  @ApiOperation({ summary: 'Create blog author (Admin)' })
  create(@Body() dto: CreateBlogAuthorDto) { return this.blogAuthorService.create(dto); }

  @Patch(':id')
  @ApiOperation({ summary: 'Update blog author (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateBlogAuthorDto) { return this.blogAuthorService.update(id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete blog author (Admin)' })
  delete(@Param('id') id: string) { return this.blogAuthorService.delete(id); }
}
