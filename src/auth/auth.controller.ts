import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './services/auth.service';
import {
  RegisterUserDto,
  LoginUserDto,
  LoginAdminDto,
  AuthResponseDto,
  RefreshResponseDto,
  GuestAuthDto,
  GuestAuthResponseDto,
  TelegramAuthDto,
  EnterUserDto,
  VerifyCodeDto,
  ResendCodeDto,
  RefreshTokenDto,
} from './dto';
import { Public } from '../shared/decorator/public.decorator';
import { User } from '../shared/decorator/user.decorator';
import { UserGuard } from '../shared/guards/user.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==================== SMS OTP AUTH ====================

  @Public()
  @Post('enter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send verification code to phone number' })
  @ApiResponse({
    status: 200,
    description: 'Verification code sent successfully',
  })
  async enterUser(@Body() dto: EnterUserDto) {
    return this.authService.enterUser(dto);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify phone number with code' })
  @ApiResponse({
    status: 200,
    description: 'Phone verified successfully, returns tokens',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  @ApiResponse({ status: 429, description: 'Too many failed attempts' })
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto);
  }

  @Public()
  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiResponse({
    status: 200,
    description: 'Verification code resent successfully',
  })
  @ApiResponse({ status: 429, description: 'Too many requests, please wait' })
  async resendCode(@Body() dto: ResendCodeDto) {
    return this.authService.resendCode(dto);
  }

  // ==================== PROFILE ====================

  @Get('me')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@User('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  // ==================== LOGOUT ====================

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
  })
  async logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout from all devices (revoke all refresh tokens)',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out from all devices',
  })
  async logoutAll(@User('id') userId: string) {
    return this.authService.logoutAll(userId);
  }

  // ==================== USER AUTH (email/password) ====================

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

  // ==================== TELEGRAM AUTH ====================

  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login or register via Telegram' })
  @ApiResponse({
    status: 200,
    description: 'User authenticated via Telegram',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid Telegram auth data' })
  @ApiResponse({ status: 403, description: 'User is banned' })
  async telegramAuth(@Body() dto: TelegramAuthDto) {
    return this.authService.telegramAuth(dto);
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
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
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
  @ApiResponse({
    status: 200,
    description: 'Guest tokens refreshed successfully',
    type: RefreshResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshGuestTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshGuestTokens(dto.refreshToken);
  }
}
