import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GuestCartService } from './services';
import { AddGuestCartItemDto, UpdateGuestCartItemDto } from './dto';
import { GuestGuard } from '../shared/guards/guest.guard';
import { Guest } from '../shared/decorator/guest.decorator';
import { Public } from '../shared/decorator/public.decorator';

@ApiTags('Guest Cart')
@Controller('guest/cart')
export class GuestCartController {
  constructor(private readonly guestCartService: GuestCartService) {}

  @Public()
  @UseGuards(GuestGuard)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get guest cart items' })
  @ApiResponse({
    status: 200,
    description: 'Cart items retrieved successfully',
  })
  async getCart(@Guest('id') sessionId: string) {
    return this.guestCartService.getCart(sessionId);
  }

  @Public()
  @UseGuards(GuestGuard)
  @Post('items')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add item to guest cart' })
  @ApiResponse({
    status: 201,
    description: 'Item added to cart successfully',
  })
  async addItem(
    @Guest('id') sessionId: string,
    @Body() dto: AddGuestCartItemDto,
  ) {
    return this.guestCartService.addItem(sessionId, dto);
  }

  @Public()
  @UseGuards(GuestGuard)
  @Patch('items/:productId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update cart item quantity' })
  @ApiResponse({
    status: 200,
    description: 'Cart item updated successfully',
  })
  async updateItem(
    @Guest('id') sessionId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateGuestCartItemDto,
  ) {
    return this.guestCartService.updateItem(sessionId, productId, dto.quantity);
  }

  @Public()
  @UseGuards(GuestGuard)
  @Delete('items/:productId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove item from guest cart' })
  @ApiResponse({
    status: 204,
    description: 'Item removed from cart successfully',
  })
  async removeItem(
    @Guest('id') sessionId: string,
    @Param('productId') productId: string,
  ) {
    return this.guestCartService.removeItem(sessionId, productId);
  }

  @Public()
  @UseGuards(GuestGuard)
  @Delete()
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear guest cart' })
  @ApiResponse({
    status: 204,
    description: 'Cart cleared successfully',
  })
  async clearCart(@Guest('id') sessionId: string) {
    return this.guestCartService.clearCart(sessionId);
  }
}
