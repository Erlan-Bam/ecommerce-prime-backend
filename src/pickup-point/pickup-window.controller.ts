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
import { PickupWindowService } from './services/pickup-window.service';
import { CreatePickupWindowDto, UpdatePickupWindowDto } from './dto';
import { PaginationDto } from '../shared/dto/pagination.dto';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Public } from '../shared/decorator/public.decorator';

@ApiTags('Pickup Windows')
@Controller('pickup-windows')
export class PickupWindowController {
  constructor(private readonly pickupWindowService: PickupWindowService) {}

  @Post()
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new pickup window (Admin)' })
  @ApiResponse({
    status: 201,
    description: 'Pickup window created successfully',
  })
  create(@Body() dto: CreatePickupWindowDto) {
    return this.pickupWindowService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all pickup windows' })
  @ApiResponse({
    status: 200,
    description: 'Pickup windows retrieved successfully',
  })
  findAll(
    @Query() paginationDto: PaginationDto,
    @Query('pointId') pointId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.pickupWindowService.findAll(paginationDto, {
      pointId,
      startDate,
      endDate,
    });
  }

  @Public()
  @Get('available/:pointId')
  @ApiOperation({ summary: 'Get available windows for a pickup point' })
  @ApiResponse({
    status: 200,
    description: 'Available windows retrieved successfully',
  })
  findAvailable(
    @Param('pointId') pointId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.pickupWindowService.findAvailable(pointId, startDate, endDate);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get pickup window by ID' })
  @ApiResponse({
    status: 200,
    description: 'Pickup window retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Pickup window not found' })
  findOne(@Param('id') id: string) {
    return this.pickupWindowService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pickup window (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Pickup window updated successfully',
  })
  update(@Param('id') id: string, @Body() dto: UpdatePickupWindowDto) {
    return this.pickupWindowService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete pickup window (Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Pickup window deleted successfully',
  })
  remove(@Param('id') id: string) {
    return this.pickupWindowService.remove(id);
  }
}
