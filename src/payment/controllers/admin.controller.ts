import {
  Controller,
  Get,
  Patch,
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
  ApiQuery,
} from '@nestjs/swagger';
import { PaymentService } from '../payment.service';
import { AdminGuard } from '../../shared/guards/admin.guard';
import { UpdatePaymentStatusDto } from '../dto';

@ApiTags('Admin Payments')
@Controller('admin/payments')
@UseGuards(AdminGuard)
@ApiBearerAuth('JWT')
export class AdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @ApiOperation({ summary: 'Get all payments with filters (Admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'COMPLETED', 'REFUNDED'],
  })
  @ApiQuery({ name: 'method', required: false, enum: ['ROBOKASSA', 'CASH'] })
  @ApiResponse({
    status: 200,
    description: 'Payments retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getAllPayments(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('status') status?: string,
    @Query('method') method?: string,
  ) {
    return this.paymentService.getAllPayments({
      page: Number(page),
      limit: Number(limit),
      status,
      method,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get payment statistics (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Stats retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  getStats() {
    return this.paymentService.getPaymentStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment by ID (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Payment retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  getPaymentById(@Param('id') paymentId: string) {
    return this.paymentService.getPaymentById(paymentId);
  }

  @Patch('order/:orderId/status')
  @ApiOperation({
    summary: 'Update payment status by order ID (Admin)',
    description:
      'Update the payment status for an order. For CASH payments, setting status to COMPLETED will automatically change the order status to PAYED.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payment status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Order has no payment or invalid payment type',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  updatePaymentStatus(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentService.updatePaymentStatus(orderId, dto);
  }
}
