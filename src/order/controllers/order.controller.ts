import {
  Controller,
  Post,
  Get,
  Delete,
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
import { OrderService } from '../order.service';
import {
  AddOrderItemDto,
  CheckoutResponseDto,
  SelectPickupDto,
  SelectPickupResponseDto,
  ApplyCouponDto,
  QuickBuyDto,
  QuickBuyResponseDto,
} from '../dto';
import { UserGuard } from '../../shared/guards/user.guard';
import { User } from '../../shared/decorator/user.decorator';
import { Public } from '../../shared/decorator/public.decorator';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(UserGuard)
@ApiBearerAuth('JWT')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // Quick buy (1-click purchase) - public endpoint
  @Public()
  @Post('quick-buy')
  @ApiOperation({
    summary: 'Quick buy - One-click purchase without authentication',
    description:
      'Creates an order with a single product. Customer contact info is stored for manual callback. No authentication required.',
  })
  @ApiResponse({
    status: 201,
    description: 'Quick buy order created successfully',
    type: QuickBuyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Product not available',
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  quickBuy(@Body() dto: QuickBuyDto) {
    return this.orderService.quickBuy(dto);
  }

  // Cart endpoints
  @Post('cart/items')
  @ApiOperation({ summary: 'Add an item to the cart' })
  @ApiResponse({
    status: 201,
    description: 'Cart item added successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Product not available',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  addToCart(@User('id') userId: string, @Body() dto: AddOrderItemDto) {
    return this.orderService.addOrderItem(userId, dto);
  }

  @Get('cart')
  @ApiOperation({ summary: 'Get all items in the cart' })
  @ApiResponse({
    status: 200,
    description: 'Cart items retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getCart(@User('id') userId: string) {
    return this.orderService.getCartItems(userId);
  }

  @Delete('cart/items/:id')
  @ApiOperation({ summary: 'Remove an item from the cart' })
  @ApiResponse({
    status: 200,
    description: 'Cart item removed successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Cart item not found' })
  removeFromCart(
    @User('id') userId: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    return this.orderService.removeOrderItem(userId, id);
  }

  @Delete('cart')
  @ApiOperation({ summary: 'Clear all items from the cart' })
  @ApiResponse({
    status: 200,
    description: 'Cart cleared successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  clearCart(@User('id') userId: string): Promise<{ message: string }> {
    return this.orderService.clearCart(userId);
  }

  // Init order endpoint
  @Post('init')
  @ApiOperation({
    summary: 'Initialize order - Convert cart items to a pending order',
    description:
      'Validates all cart items, ensures products are active, calculates total price, and creates a pending order. User must then select pickup point and window to complete checkout.',
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  initOrder(@User('id') userId: string) {
    return this.orderService.initOrder(userId);
  }

  // Select pickup point and window endpoint
  @Post(':id/pickup')
  @ApiOperation({
    summary: 'Select pickup point and window for an order',
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order or pickup point not found' })
  @ApiResponse({ status: 409, description: 'Pickup window is fully booked' })
  selectPickup(
    @User('id') userId: string,
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: SelectPickupDto,
  ) {
    return this.orderService.selectPickup(userId, orderId, dto);
  }

  // Apply coupon endpoint
  @Post(':id/coupon')
  @ApiOperation({
    summary: 'Apply a coupon to an order',
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order or coupon not found' })
  @ApiResponse({
    status: 409,
    description: 'Order already has a coupon applied',
  })
  applyCoupon(
    @User('id') userId: string,
    @Param('id', ParseIntPipe) orderId: number,
    @Body() dto: ApplyCouponDto,
  ) {
    return this.orderService.applyCoupon(userId, orderId, dto);
  }

  // Remove coupon endpoint
  @Delete(':id/coupon')
  @ApiOperation({
    summary: 'Remove a coupon from an order',
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
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  removeCoupon(
    @User('id') userId: string,
    @Param('id', ParseIntPipe) orderId: number,
  ) {
    return this.orderService.removeCoupon(userId, orderId);
  }

  // Order endpoints
  @Get()
  @ApiOperation({ summary: 'Get all orders for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getUserOrders(@User('id') userId: string) {
    return this.orderService.getUserOrders(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific order by ID' })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOrderById(
    @User('id') userId: string,
    @Param('id', ParseIntPipe) orderId: number,
  ) {
    return this.orderService.getOrderById(userId, orderId);
  }
}
