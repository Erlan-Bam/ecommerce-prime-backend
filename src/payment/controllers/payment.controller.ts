import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PaymentService } from '../payment.service';
import { CreatePaymentDto } from '../dto';
import { UserGuard } from '../../shared/guards/user.guard';
import { User } from '../../shared/decorator/user.decorator';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(UserGuard)
@ApiBearerAuth('JWT')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a payment for an order',
    description:
      'Creates a payment with selected payment method. This will change the order status to PROCESSING. Requires pickup point and window to be selected first.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payment created successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Order not in valid state or pickup not selected',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'Order already has a payment' })
  createPayment(@User('id') userId: string, @Body() dto: CreatePaymentDto) {
    return this.paymentService.createPayment(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all payments for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Payments retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getUserPayments(@User('id') userId: string) {
    return this.paymentService.getUserPayments(userId);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get payment by order ID' })
  @ApiResponse({
    status: 200,
    description: 'Payment retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order or payment not found' })
  getPaymentByOrderId(
    @User('id') userId: string,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.paymentService.getPaymentByOrderId(userId, orderId);
  }
}
