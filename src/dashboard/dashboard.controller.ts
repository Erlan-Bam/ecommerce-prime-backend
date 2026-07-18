import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import * as path from 'path';

@ApiTags('Dashboard')
@Controller('admin/dashboard')
@UseGuards(AdminGuard)
@ApiBearerAuth('JWT')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getStats() {
    return this.dashboardService.getDashboardStats();
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Get recent orders (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Recent orders retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getRecentOrders() {
    return this.dashboardService.getRecentOrders();
  }

  @Get('parser-status')
  @ApiOperation({
    summary: 'Get parser status (Admin)',
    description:
      'Returns parser script/file status and current products counters',
  })
  @ApiResponse({
    status: 200,
    description: 'Parser status retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getParserStatus() {
    return this.dashboardService.getParserStatus();
  }

  @Get('export/products-xlsx')
  @ApiOperation({
    summary: 'Export all products to XLSX (Admin)',
    description:
      'Generates products.xlsx from current database state (including manually added products)',
  })
  @ApiProduces(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiResponse({
    status: 200,
    description: 'Products XLSX generated and downloaded successfully',
  })
  @ApiQuery({
    name: 'activity',
    required: false,
    enum: ['all', 'active', 'inactive'],
    description: 'Filter exported products by active status',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Export products from this category and its subcategories',
  })
  @ApiQuery({
    name: 'brandId',
    required: false,
    description: 'Export products from this brand',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async exportProductsXlsx(
    @Res() res: Response,
    @Query('activity') activity?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
  ) {
    const exported = await this.dashboardService.exportProductsXlsx(
      activity,
      categoryId,
      brandId,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.fileName}"`,
    );
    res.setHeader('Content-Length', exported.buffer.length.toString());
    res.setHeader('X-Products-Count', exported.rowsCount.toString());

    return res.send(exported.buffer);
  }

  @Post('import/products-xlsx')
  @ApiOperation({
    summary: 'Import products from XLSX (Admin)',
    description:
      'Imports products from XLSX file and creates/updates records in database',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Products imported successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 15 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ];
        const ext = path.extname(file.originalname || '').toLowerCase();
        const isExcelExt = ext === '.xlsx' || ext === '.xls';

        if (isExcelExt || allowedMimeTypes.includes(file.mimetype)) {
          callback(null, true);
          return;
        }

        callback(
          new HttpException(
            'Invalid file type. Only .xlsx files are supported',
            HttpStatus.BAD_REQUEST,
          ),
          false,
        );
      },
    }),
  )
  async importProductsXlsx(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    return this.dashboardService.importProductsXlsx(
      file.buffer,
      file.originalname,
    );
  }

  @Get('import/products-xlsx/undo-status')
  @ApiOperation({
    summary: 'Get latest XLSX import rollback availability (Admin)',
  })
  getProductsXlsxUndoStatus() {
    return this.dashboardService.getProductsXlsxUndoStatus();
  }

  @Post('import/products-xlsx/undo')
  @ApiOperation({ summary: 'Rollback latest XLSX product import (Admin)' })
  undoLatestProductsXlsxImport() {
    return this.dashboardService.undoLatestProductsXlsxImport();
  }

  @Get('analytics/overview')
  @ApiOperation({
    summary: 'Get comprehensive analytics overview (Admin)',
    description:
      'Returns analytics with day/week/month comparisons, payment methods, order status, and delivery methods',
  })
  @ApiResponse({
    status: 200,
    description: 'Analytics overview retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getAnalyticsOverview() {
    return this.dashboardService.getAnalyticsOverview();
  }

  @Get('analytics/period')
  @ApiOperation({
    summary: 'Get period-based analytics comparison (Admin)',
    description: 'Compare metrics between current and previous period',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Time period for comparison (default: month)',
  })
  @ApiResponse({
    status: 200,
    description: 'Period analytics retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getPeriodAnalytics(@Query('period') period?: 'day' | 'week' | 'month') {
    return this.dashboardService.getPeriodAnalytics(period || 'month');
  }

  @Get('analytics/payment-methods')
  @ApiOperation({
    summary: 'Get payment methods breakdown (Admin)',
    description:
      'Returns distribution of orders by payment method with percentages',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment methods analytics retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getPaymentMethodsAnalytics() {
    return this.dashboardService.getPaymentMethodsAnalytics();
  }

  @Get('analytics/order-status')
  @ApiOperation({
    summary: 'Get order status distribution (Admin)',
    description: 'Returns distribution of orders by status for pie/donut chart',
  })
  @ApiResponse({
    status: 200,
    description: 'Order status analytics retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getOrderStatusAnalytics() {
    return this.dashboardService.getOrderStatusAnalytics();
  }

  @Get('analytics/delivery-methods')
  @ApiOperation({
    summary: 'Get delivery methods breakdown (Admin)',
    description: 'Returns distribution of orders by delivery method',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery methods analytics retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getDeliveryMethodsAnalytics() {
    return this.dashboardService.getDeliveryMethodsAnalytics();
  }

  @Get('analytics/revenue-trend')
  @ApiOperation({
    summary: 'Get revenue trend over time (Admin)',
    description: 'Returns daily revenue data for line/area chart',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to include (default: 30)',
  })
  @ApiResponse({
    status: 200,
    description: 'Revenue trend retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getRevenueTrend(@Query('days') days?: string) {
    return this.dashboardService.getRevenueTrend(
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('analytics/top-products')
  @ApiOperation({
    summary: 'Get top selling products (Admin)',
    description: 'Returns top products by units sold in the last 30 days',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of products to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Top products retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getTopProducts(@Query('limit') limit?: string) {
    return this.dashboardService.getTopProducts(
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('analytics/top-categories')
  @ApiOperation({
    summary: 'Get top categories by revenue (Admin)',
    description: 'Returns top categories ranked by revenue',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of categories to return (default: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Top categories retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getTopCategories(@Query('limit') limit?: string) {
    return this.dashboardService.getTopCategories(
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('analytics/order-heatmap')
  @ApiOperation({
    summary: 'Get order heatmap data (Admin)',
    description:
      'Returns hourly order distribution by day of week for heatmap visualization',
  })
  @ApiResponse({
    status: 200,
    description: 'Order heatmap data retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getOrderHeatmap() {
    return this.dashboardService.getOrderHeatmap();
  }

  @Get('deleted-items')
  @ApiOperation({
    summary: 'Get overview of all soft-deleted items (Admin)',
    description:
      'Returns counts and recent soft-deleted items across categories, brands, products, and coupons',
  })
  @ApiResponse({
    status: 200,
    description: 'Deleted items overview retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getDeletedItems() {
    return this.dashboardService.getDeletedItemsOverview();
  }
}
