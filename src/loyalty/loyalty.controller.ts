import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';
import { UserGuard } from '../shared/guards/user.guard';
import { User } from '../shared/decorator/user.decorator';

@ApiTags('Loyalty')
@Controller('loyalty')
@UseGuards(UserGuard)
@ApiBearerAuth('JWT')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get()
  @ApiOperation({ summary: 'Get loyalty info (balance, tier, cashback rate)' })
  @ApiResponse({
    status: 200,
    description: 'Loyalty info retrieved successfully',
  })
  getLoyaltyInfo(@User('id') userId: string) {
    return this.loyaltyService.getLoyaltyInfo(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get bonus transaction history' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Bonus history retrieved successfully',
  })
  getHistory(
    @User('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.loyaltyService.getHistory(userId, page, limit);
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Preview cashback for an order total (no side effects)',
  })
  @ApiQuery({ name: 'total', required: true, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Cashback preview calculated',
  })
  previewCashback(
    @User('id') userId: string,
    @Query('total') total: string,
  ) {
    return this.loyaltyService.previewCashback(userId, parseFloat(total) || 0);
  }
}
