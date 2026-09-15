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
  UpsertStaticPageDto,
} from './dto';
import { SeoService } from './seo.service';
import { SeoTagTileService } from './seo-tag-tile.service';
import { StaticPageBuilderService } from './static-page-builder.service';

@ApiTags('SEO')
@Controller('seo')
export class SeoController {
  constructor(
    private readonly seoService: SeoService,
    private readonly seoTagTileService: SeoTagTileService,
    private readonly staticPageBuilderService: StaticPageBuilderService,
  ) {}

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
    return this.seoTagTileService.list(false, categoryId);
  }

  @UseGuards(AdminGuard)
  @Get('admin/tag-tiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all SEO tag tiles (Admin)' })
  listAdminTagTiles() {
    return this.seoTagTileService.list(true);
  }

  @UseGuards(AdminGuard)
  @Post('admin/tag-tiles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create SEO tag tile (Admin)' })
  createTagTile(@Body() dto: UpsertSeoTagTileDto) {
    return this.seoTagTileService.create(dto);
  }

  @UseGuards(AdminGuard)
  @Patch('admin/tag-tiles/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SEO tag tile (Admin)' })
  updateTagTile(@Param('id') id: string, @Body() dto: UpsertSeoTagTileDto) {
    return this.seoTagTileService.update(id, dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/tag-tiles/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete SEO tag tile (Admin)' })
  deleteTagTile(@Param('id') id: string) {
    return this.seoTagTileService.remove(id);
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

  @Public()
  @Get('page-builder')
  @ApiOperation({ summary: 'Get rendered static page builder data by path' })
  findBuilderPage(@Query('path') path = '/') {
    return this.staticPageBuilderService.findPublicPage(path);
  }

  @UseGuards(AdminGuard)
  @Get('admin/pages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List visual static pages (Admin)' })
  listBuilderPages() {
    return this.staticPageBuilderService.listAdminPages();
  }

  @UseGuards(AdminGuard)
  @Post('admin/pages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update a visual static page (Admin)' })
  upsertBuilderPage(@Body() dto: UpsertStaticPageDto) {
    return this.staticPageBuilderService.upsertPage(dto);
  }

  @UseGuards(AdminGuard)
  @Delete('admin/pages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a visual static page (Admin)' })
  deleteBuilderPage(@Query('path') path: string) {
    return this.staticPageBuilderService.removePage(path);
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
