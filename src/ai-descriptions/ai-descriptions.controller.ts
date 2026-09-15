import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../shared/guards/admin.guard';
import { AiDescriptionsService } from './ai-descriptions.service';

@ApiTags('AI Descriptions')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('ai-descriptions')
export class AiDescriptionsController {
  constructor(private readonly service: AiDescriptionsService) {}

  @Get('settings')
  @ApiOperation({ summary: 'Get GEN API settings' })
  getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @ApiOperation({ summary: 'Save GEN API settings' })
  saveSettings(@Body() body: { apiKey?: string; model?: string }) {
    return this.service.saveSettings(body);
  }

  @Post('products/:productId/generate')
  @ApiOperation({ summary: 'Generate or regenerate AI draft for product' })
  generateProduct(@Param('productId') productId: string) {
    return this.service.generateProductDraft(productId, null);
  }

  @Get('products/:productId/draft')
  @ApiOperation({ summary: 'Get AI draft for product' })
  getProductDraft(@Param('productId') productId: string) {
    return this.service.getDraft(productId);
  }

  @Post('products/:productId/apply')
  @ApiOperation({ summary: 'Apply AI draft to product description' })
  applyProduct(@Param('productId') productId: string) {
    return this.service.applyDraft(productId);
  }

  @Get('drafts')
  @ApiOperation({ summary: 'List generated AI description drafts' })
  listDrafts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listDrafts(Number(page || 1), Number(limit || 50), status);
  }

  @Post('batches')
  @ApiOperation({ summary: 'Start mass AI description generation' })
  startBatch() {
    return this.service.startBatch();
  }

  @Get('batches/latest')
  @ApiOperation({ summary: 'Get latest mass generation batch' })
  getLatestBatch() {
    return this.service.getLatestBatch();
  }

  @Get('batches/:id')
  @ApiOperation({ summary: 'Get mass generation batch' })
  getBatch(@Param('id') id: string) {
    return this.service.getBatch(id);
  }

  @Post('apply-all')
  @ApiOperation({ summary: 'Apply all ready AI drafts' })
  applyAll() {
    return this.service.applyAllReady();
  }
}
