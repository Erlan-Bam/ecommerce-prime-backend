import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CouponService } from './coupon.service';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto';
import { PaginationDto } from '../shared/dto/pagination.dto';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Public } from '../shared/decorator/public.decorator';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new coupon (Admin)' })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 409, description: 'Coupon with this code already exists' })
  create(@Body() createCouponDto: CreateCouponDto) {
    return this.couponService.create(createCouponDto);
  }

  @Get()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all coupons (Admin)' })
  @ApiResponse({ status: 200, description: 'Coupons retrieved successfully' })
  findAll(@Query() pagination: PaginationDto) {
    return this.couponService.findAll(pagination);
  }

  @Public()
  @Get('active')
  @ApiOperation({ summary: 'Get active coupons' })
  @ApiResponse({ status: 200, description: 'Active coupons retrieved' })
  findActive() {
    return this.couponService.findActive();
  }

  @Public()
  @Post('validate')
  @ApiOperation({ summary: 'Validate a coupon code' })
  @ApiResponse({ status: 200, description: 'Coupon is valid' })
  @ApiResponse({ status: 400, description: 'Coupon is not valid' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  validateCoupon(@Body() validateCouponDto: ValidateCouponDto) {
    return this.couponService.validateCoupon(validateCouponDto.code);
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get coupon by ID (Admin)' })
  @ApiResponse({ status: 200, description: 'Coupon retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  findOne(@Param('id') id: string) {
    return this.couponService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update coupon (Admin)' })
  @ApiResponse({ status: 200, description: 'Coupon updated successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  update(@Param('id') id: string, @Body() updateCouponDto: UpdateCouponDto) {
    return this.couponService.update(id, updateCouponDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete coupon (Admin)' })
  @ApiResponse({ status: 200, description: 'Coupon deleted successfully' })
  @ApiResponse({ status: 404, description: 'Coupon not found' })
  remove(@Param('id') id: string) {
    return this.couponService.remove(id);
  }

  @Post(':id/increment-usage')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Increment coupon usage count (Admin)' })
  @ApiResponse({ status: 200, description: 'Usage count incremented' })
  incrementUsage(@Param('id') id: string) {
    return this.couponService.incrementUsage(id);
  }
}
