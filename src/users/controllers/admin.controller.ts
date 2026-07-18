import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from '../users.service';
import {
  AdjustUserBonusDto,
  AdminChangeUserPasswordDto,
  CreateAdminUserDto,
  UpdateUserDto,
} from '../dto';
import { AdminGuard } from '../../shared/guards/admin.guard';
import { User } from '../../shared/decorator/user.decorator';
import { Roles } from '../../shared/decorator/roles.decorator';

@ApiTags('Admin - Users')
@Controller('admin/users')
@UseGuards(AdminGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current admin profile' })
  @ApiResponse({
    status: 200,
    description: 'Admin profile retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied: Admins only' })
  async getAdminProfile(@User('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  create(@Body() dto: CreateAdminUserDto) {
    return this.usersService.createByAdmin(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['USER', 'EDITOR', 'MANAGER', 'ADMIN'],
  })
  @ApiQuery({ name: 'isBanned', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('role') role?: string,
    @Query('isBanned') isBanned?: boolean,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.usersService.findAll({
      page,
      limit,
      role,
      isBanned,
      search,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post(':id/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change user password (Admin only)' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Passwords do not match',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  changePassword(
    @Param('id') id: string,
    @Body() dto: AdminChangeUserPasswordDto,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    return this.usersService.changePassword(id, dto.newPassword);
  }

  @Get(':id/bonuses/balance')
  @ApiOperation({ summary: 'Get user bonus balance (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bonus balance retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getBonusBalance(@Param('id') id: string) {
    return this.usersService.getBonusBalance(id);
  }

  @Post(':id/bonuses/accrue')
  @ApiOperation({ summary: 'Accrue bonuses manually (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bonuses accrued successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  accrueBonus(@Param('id') id: string, @Body() dto: AdjustUserBonusDto) {
    return this.usersService.accrueBonus(id, dto);
  }

  @Post(':id/bonuses/write-off')
  @ApiOperation({ summary: 'Write off bonuses manually (Admin only)' })
  @ApiResponse({ status: 200, description: 'Bonuses written off successfully' })
  @ApiResponse({ status: 400, description: 'Not enough bonus balance' })
  @ApiResponse({ status: 404, description: 'User not found' })
  writeOffBonus(@Param('id') id: string, @Body() dto: AdjustUserBonusDto) {
    return this.usersService.writeOffBonus(id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/ban')
  @ApiOperation({ summary: 'Ban user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User banned successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  ban(@Param('id') id: string) {
    return this.usersService.ban(id);
  }

  @Patch(':id/unban')
  @ApiOperation({ summary: 'Unban user (Admin only)' })
  @ApiResponse({ status: 200, description: 'User unbanned successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  unban(@Param('id') id: string) {
    return this.usersService.unban(id);
  }
}
