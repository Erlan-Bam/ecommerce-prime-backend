import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AdminGuard } from '../shared/guards/admin.guard';

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
}
