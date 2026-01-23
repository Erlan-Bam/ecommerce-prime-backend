import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GuestOrderService } from './services/guest-order.service';
import {
  CheckoutResponseDto,
  SelectPickupDto,
  SelectPickupResponseDto,
  FinalizeOrderDto,
  FinalizeOrderResponseDto,
  ApplyCouponDto,
} from '../order/dto';
import { GuestGuard } from '../shared/guards/guest.guard';
import { Guest } from '../shared/decorator/guest.decorator';
import { Public } from '../shared/decorator/public.decorator';

@ApiTags('Guest Orders')
@Controller('guest/orders')
export class GuestOrderController {
  constructor(private readonly guestOrderService: GuestOrderService) {}

  // Init order endpoint
  @Public()
  @UseGuards(GuestGuard)
  @Post('init')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Initialize guest order - Convert cart items to a pending order',
    description:
      'Validates all cart items, ensures products are active, calculates total price, and creates a pending order for guest user.',
  })
  @ApiResponse({
    status: 201,
    description: 'Order initialized successfully',
    type: CheckoutResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Cart is empty or contains inactive products',
  })
  initOrder(@Guest('id') sessionId: string) {
    return this.guestOrderService.initOrder(sessionId);
  }

  // Get all guest orders
  @Public()
  @UseGuards(GuestGuard)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all orders for the guest session' })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  getGuestOrders(@Guest('id') sessionId: string) {
    return this.guestOrderService.getGuestOrders(sessionId);
  }

  // Get specific guest order
  @Public()
  @UseGuards(GuestGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific guest order by ID' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrderById(
    @Guest('id') sessionId: string,
    @Param('id', ParseIntPipe) orderId: number,
  ) {
    return this.guestOrderService.getOrderById(sessionId, orderId);
  }

  // Select pickup point and window endpoint
  @Public()
  @UseGuards(GuestGuard)
  @Post(':id/pickup')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Select pickup point and window for a guest order',
    description:
      'Assigns a pickup point and time window to a pending order. Windows are hourly slots from 10:00 to 21:00 Moscow time, each with a capacity of 24 orders.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pickup selected successfully',
    type: SelectPickupResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid time or order state',
  })
  @ApiResponse({ status: 404, description: 'Order or pickup point not found' })
  @ApiResponse({ status: 409, description: 'Pickup window is fully booked' })
  selectPickup(
    @Guest('id') sessionId: string,
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: SelectPickupDto,
  ) {
    return this.guestOrderService.selectPickup(sessionId, orderId, dto);
  }

  // Finalize order endpoint
  @Public()
  @UseGuards(GuestGuard)
  @Post(':id/finalize')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Finalize guest order with delivery details and contact information',
    description:
      'Finalizes a pending order with delivery method (PICKUP or DELIVERY), contact information (buyer name, email, phone), and delivery details.',
  })
  @ApiResponse({
    status: 200,
    description: 'Order finalized successfully',
    type: FinalizeOrderResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid data or order state',
  })
  @ApiResponse({ status: 404, description: 'Order or pickup point not found' })
  @ApiResponse({ status: 409, description: 'Pickup window is fully booked' })
  finalizeOrder(
    @Guest('id') sessionId: string,
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: FinalizeOrderDto,
  ) {
    return this.guestOrderService.finalizeOrder(sessionId, orderId, dto);
  }

  // Apply coupon endpoint
  @Public()
  @UseGuards(GuestGuard)
  @Post(':id/coupon')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Apply a coupon to a guest order',
    description:
      'Validates and applies a coupon code to a pending order. Calculates the discount based on coupon type (percentage or fixed) and updates the order total.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coupon applied successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid coupon or order state',
  })
  @ApiResponse({ status: 404, description: 'Order or coupon not found' })
  @ApiResponse({
    status: 409,
    description: 'Order already has a coupon applied',
  })
  applyCoupon(
    @Guest('id') sessionId: string,
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: ApplyCouponDto,
  ) {
    return this.guestOrderService.applyCoupon(sessionId, orderId, dto);
  }

  // Remove coupon endpoint
  @Public()
  @UseGuards(GuestGuard)
  @Delete(':id/coupon')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove a coupon from a guest order',
    description:
      'Removes the applied coupon from a pending order and restores the original total.',
  })
  @ApiResponse({
    status: 200,
    description: 'Coupon removed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Order does not have a coupon or invalid state',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  removeCoupon(
    @Guest('id') sessionId: string,
    @Param('id', ParseIntPipe) orderId: number,
  ) {
    return this.guestOrderService.removeCoupon(sessionId, orderId);
  }
}
