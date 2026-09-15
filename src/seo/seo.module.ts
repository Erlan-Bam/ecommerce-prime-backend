import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { SeoTagTileService } from './seo-tag-tile.service';
import { StaticPageBuilderService } from './static-page-builder.service';

@Module({
  imports: [SharedModule],
  controllers: [SeoController],
  providers: [SeoService, SeoTagTileService, StaticPageBuilderService],
  exports: [SeoService, SeoTagTileService, StaticPageBuilderService],
})
export class SeoModule {}
