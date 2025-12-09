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
import { PickupPointService } from './services/pickup-point.service';
import {
  CreatePickupPointDto,
  UpdatePickupPointDto,
  CreateProductStockDto,
  UpdateProductStockDto,
} from './dto';
import { PaginationDto } from '../shared/dto/pagination.dto';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Public } from '../shared/decorator/public.decorator';

@ApiTags('Pickup Points')
@Controller('pickup-points')
export class PickupPointController {
  constructor(private readonly pickupPointService: PickupPointService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new pickup point (Admin)' })
  @ApiResponse({ status: 201, description: 'Pickup point created successfully' })
  create(@Body() dto: CreatePickupPointDto) {
    return this.pickupPointService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all pickup points' })
  @ApiResponse({ status: 200, description: 'Pickup points retrieved successfully' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.pickupPointService.findAll(paginationDto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get pickup point by ID' })
  @ApiResponse({ status: 200, description: 'Pickup point retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Pickup point not found' })
  findOne(@Param('id') id: string) {
    return this.pickupPointService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pickup point (Admin)' })
  @ApiResponse({ status: 200, description: 'Pickup point updated successfully' })
  update(@Param('id') id: string, @Body() dto: UpdatePickupPointDto) {
    return this.pickupPointService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete pickup point (Admin)' })
  @ApiResponse({ status: 200, description: 'Pickup point deleted successfully' })
  remove(@Param('id') id: string) {
    return this.pickupPointService.remove(id);
  }

  // Product Stock endpoints
  @Post('stock')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create product stock entry (Admin)' })
  @ApiResponse({ status: 201, description: 'Product stock created successfully' })
  createProductStock(@Body() dto: CreateProductStockDto) {
    return this.pickupPointService.createProductStock(dto);
  }

  @Patch('stock/:productId/:pointId')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update product stock entry (Admin)' })
  @ApiResponse({ status: 200, description: 'Product stock updated successfully' })
  updateProductStock(
    @Param('productId') productId: string,
    @Param('pointId') pointId: string,
    @Body() dto: UpdateProductStockDto,
  ) {
    return this.pickupPointService.updateProductStock(productId, pointId, dto);
  }

  @Delete('stock/:productId/:pointId')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete product stock entry (Admin)' })
  @ApiResponse({ status: 200, description: 'Product stock deleted successfully' })
  removeProductStock(
    @Param('productId') productId: string,
    @Param('pointId') pointId: string,
  ) {
    return this.pickupPointService.removeProductStock(productId, pointId);
  }

  @Public()
  @Get('stock/product/:productId')
  @ApiOperation({ summary: 'Get stock for a product across all pickup points' })
  @ApiResponse({ status: 200, description: 'Product stock retrieved successfully' })
  getProductStockByProduct(@Param('productId') productId: string) {
    return this.pickupPointService.getProductStockByProduct(productId);
  }

  @Public()
  @Get(':pointId/stock')
  @ApiOperation({ summary: 'Get all stock entries for a pickup point' })
  @ApiResponse({ status: 200, description: 'Stock entries retrieved successfully' })
  getProductStockByPoint(@Param('pointId') pointId: string) {
    return this.pickupPointService.getProductStockByPoint(pointId);
  }
}
