import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import {
  AddOrderItemDto,
  CheckoutResponseDto,
  SelectPickupDto,
  SelectPickupResponseDto,
} from './dto';
import { UserGuard } from '../shared/guards/user.guard';
import { User } from '../shared/decorator/user.decorator';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(UserGuard)
@ApiBearerAuth('JWT')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

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
    @Param('id') orderId: string,
    @Body() dto: SelectPickupDto,
  ) {
    return this.orderService.selectPickup(userId, orderId, dto);
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
  getOrderById(@User('id') userId: string, @Param('id') orderId: string) {
    return this.orderService.getOrderById(userId, orderId);
  }
}
