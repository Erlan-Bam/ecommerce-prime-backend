import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
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
}
