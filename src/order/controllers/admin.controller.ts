import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { OrderService } from '../order.service';
import { AdminGuard } from '../../shared/guards/admin.guard';
import {
  UpdateOrderStatusDto,
  AdminFinalizeOrderDto,
  AdminFinalizeOrderResponseDto,
} from '../dto';

@ApiTags('Admin Orders')
@Controller('admin/orders')
@UseGuards(AdminGuard)
@ApiBearerAuth('JWT')
export class AdminOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('pending')
  @ApiOperation({
    summary:
      'Get all pending orders (quick buy orders waiting for finalization)',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending orders retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getPendingOrders(@Query('page') page = 1, @Query('limit') limit = 10) {
    return this.orderService.getPendingOrders({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Post(':id/finalize')
  @ApiOperation({
    summary: 'Finalize a pending order (Admin)',
    description:
      'Complete order details for quick buy orders. Set delivery method, payment method, pickup point/address, etc.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order finalized successfully',
    type: AdminFinalizeOrderResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 400,
    description: 'Order is not in PENDING status',
  })
  adminFinalizeOrder(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: AdminFinalizeOrderDto,
  ) {
    return this.orderService.adminFinalizeOrder(orderId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders with filters (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getAllOrders(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.orderService.getAllOrders({
      page: Number(page),
      limit: Number(limit),
      status,
      userId,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get order statistics (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Stats retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getStats() {
    return this.orderService.getOrderStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrderByIdAdmin(@Param('id', ParseIntPipe) orderId: number) {
    return this.orderService.getOrderByIdAdmin(orderId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  updateOrderStatus(
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateOrderStatus(orderId, dto);
  }
}
