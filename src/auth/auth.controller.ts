import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Ip,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterUserDto,
  LoginUserDto,
  LoginAdminDto,
  AuthResponseDto,
  RefreshResponseDto,
  GuestAuthDto,
  GuestAuthResponseDto,
} from './dto';
import { Public } from '../shared/decorator/public.decorator';
import { User } from '../shared/decorator/user.decorator';
import { UserGuard } from '../shared/guards/user.guard';
import { AdminGuard } from '../shared/guards/admin.guard';
import { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==================== USER AUTH ====================

  @Public()
  @Post('user/register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Email or phone already exists' })
  async registerUser(@Body() dto: RegisterUserDto) {
    return this.authService.registerUser(dto);
  }

  @Public()
  @Post('user/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login as user' })
  @ApiResponse({
    status: 200,
    description: 'User logged in successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'User is banned' })
  async loginUser(@Body() dto: LoginUserDto) {
    return this.authService.loginUser(dto);
  }

  // ==================== ADMIN AUTH ====================

  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login as admin' })
  @ApiResponse({
    status: 200,
    description: 'Admin logged in successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Access denied: Admins only' })
  async loginAdmin(@Body() dto: LoginAdminDto) {
    return this.authService.loginAdmin(dto);
  }

  // ==================== TOKEN REFRESH ====================

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string' },
      },
      required: ['refreshToken'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshTokens(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshTokens(refreshToken);
  }

  // ==================== PROFILE ENDPOINTS ====================

  @UseGuards(UserGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@User('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @UseGuards(AdminGuard)
  @Get('admin/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current admin profile' })
  @ApiResponse({
    status: 200,
    description: 'Admin profile retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied: Admins only' })
  async getAdminProfile(@User('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  // ==================== GUEST AUTH ====================

  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate as guest using device fingerprint' })
  @ApiResponse({
    status: 200,
    description: 'Guest authenticated successfully',
    type: GuestAuthResponseDto,
  })
  async guestAuth(@Body() dto: GuestAuthDto, @Ip() ip: string) {
    return this.authService.guestAuth(dto, ip);
  }

  @Public()
  @Post('guest/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh guest access token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string' },
      },
      required: ['refreshToken'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Guest tokens refreshed successfully',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshGuestTokens(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshGuestTokens(refreshToken);
  }

  @UseGuards(UserGuard)
  @Post('guest/merge')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge guest cart to authenticated user cart' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        guestSessionId: { type: 'string' },
      },
      required: ['guestSessionId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Guest cart merged successfully',
  })
  async mergeGuestCart(
    @User('id') userId: string,
    @Body('guestSessionId') guestSessionId: string,
  ) {
    return this.authService.mergeGuestCartToUser(guestSessionId, userId);
  }
}
