import {
  Controller,
  Post,
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
import { AddOrderItemDto } from './dto';
import { UserGuard } from '../shared/guards/user.guard';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(UserGuard)
@ApiBearerAuth('JWT')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('items')
  @ApiOperation({ summary: 'Add an item to the order' })
  @ApiResponse({
    status: 201,
    description: 'Order item added successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Product not available',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  addOrderItem(@Body() dto: AddOrderItemDto) {
    return this.orderService.addOrderItem(dto);
  }

  @Delete('items/:id')
  @ApiOperation({ summary: 'Remove an item from the order' })
  @ApiResponse({
    status: 200,
    description: 'Order item removed successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order item not found' })
  removeOrderItem(@Param('id') id: string): Promise<{ message: string }> {
    return this.orderService.removeOrderItem(id);
  }
}
