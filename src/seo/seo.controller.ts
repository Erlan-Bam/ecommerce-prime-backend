import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SeoPageType } from '@prisma/client';
import { Public } from '../shared/decorator/public.decorator';
import { AdminGuard } from '../shared/guards/admin.guard';
import {
  UpdateRobotsDto,
  UpdateSeoTemplateDto,
  UpdateStaticPageSeoDto,
  UpsertSeoCollectionDto,
  UpsertSeoTagTileDto,
} from './dto';
import { SeoService } from './seo.service';

@ApiTags('SEO')
@Controller('seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  @Public()
  @Get('templates')
  @ApiOperation({ summary: 'Get SEO templates' })
  listTemplates() {
    return this.seoService.listTemplates();
  }

  @Public()
  @Get('robots')
  @ApiOperation({ summary: 'Get editable robots.txt content' })
  getRobots() {
    return this.seoService.getRobots();
  }

  @UseGuards(AdminGuard)
  @Patch('robots')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update robots.txt content (Admin)' })
  updateRobots(@Body() dto: UpdateRobotsDto) {
    return this.seoService.updateRobots(dto);
  }

  @Public()
  @Get('collections')
  @ApiOperation({ summary: 'Get active SEO collections' })
  listPublicCollections() {
    return this.seoService.listCollections();
  }

  @Public()
  @Get('collections/:slug')
  @ApiOperation({ summary: 'Get active SEO collection by slug' })
  findPublicCollection(@Param('slug') slug: string) {
    return this.seoService.findCollectionBySlug(slug);
  }

  @UseGuards(AdminGuard)
  @Get('admin/collections')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all SEO collections (Admin)' })
  listAdminCollections() {
    return this.seoService.listCollections(true);
  }

  @UseGuards(AdminGuard)
  @Post('admin/collections')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create SEO collection (Admin)' })
  createCollection(@Body() dto: UpsertSeoCollectionDto) {
    return this.seoService.createCollection(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/collections/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SEO collection (Admin)' })
  updateCollection(@Param('id') id: string, @Body() dto: UpsertSeoCollectionDto) {
    return this.seoService.updateCollection(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/collections/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete SEO collection (Admin)' })
  deleteCollection(@Param('id') id: string) {
    return this.seoService.removeCollection(id);
  }

  @Public()
  @Get('tag-tiles')
  @ApiOperation({ summary: 'Get active SEO tag tiles' })
  listPublicTagTiles(@Query('categoryId') categoryId?: string) {
    return this.seoService.listTagTiles(false, categoryId);
  }

  @UseGuards(AdminGuard)
  @Get('admin/tag-tiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all SEO tag tiles (Admin)' })
  listAdminTagTiles() {
    return this.seoService.listTagTiles(true);
  }

  @UseGuards(AdminGuard)
  @Post('admin/tag-tiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create SEO tag tile (Admin)' })
  createTagTile(@Body() dto: UpsertSeoTagTileDto) {
    return this.seoService.createTagTile(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/tag-tiles/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SEO tag tile (Admin)' })
  updateTagTile(@Param('id') id: string, @Body() dto: UpsertSeoTagTileDto) {
    return this.seoService.updateTagTile(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/tag-tiles/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete SEO tag tile (Admin)' })
  deleteTagTile(@Param('id') id: string) {
    return this.seoService.removeTagTile(id);
  }

  @Public()
  @Get('static-page')
  @ApiOperation({ summary: 'Get static page SEO by path' })
  findStaticPage(@Query('path') path = '/') {
    return this.seoService.findStaticPage(path);
  }

  @UseGuards(AdminGuard)
  @Get('static-pages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get editable static page SEO records' })
  listStaticPages() {
    return this.seoService.listStaticPages();
  }

  @UseGuards(AdminGuard)
  @Patch('static-pages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upsert static page SEO record' })
  updateStaticPage(@Body() dto: UpdateStaticPageSeoDto) {
    return this.seoService.updateStaticPage(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('templates/:type')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upsert SEO template by page type' })
  updateTemplate(
    @Param('type') type: SeoPageType,
    @Body() dto: UpdateSeoTemplateDto,
  ) {
    return this.seoService.updateTemplate(type, dto);
  }
}
