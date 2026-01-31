import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from '../users.service';
import { ChangePasswordDto } from '../../auth/dto';
import { FormDto } from '../../email/dto';
import { UserGuard } from '../../shared/guards/user.guard';
import { User } from '../../shared/decorator/user.decorator';
import { EmailService } from '../../email/email.service';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  @UseGuards(UserGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@User('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @UseGuards(UserGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Passwords do not match',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePassword(
    @User('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new HttpException('Passwords do not match', HttpStatus.BAD_REQUEST);
    }
    return this.usersService.changePassword(userId, dto.newPassword);
  }

  @Post('form')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit contact form' })
  @ApiResponse({
    status: 200,
    description: 'Contact form submitted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: {
          type: 'string',
          example:
            'Ваше сообщение успешно отправлено. Мы свяжемся с вами в ближайшее время.',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async submitForm(@Body() formDto: FormDto) {
    return this.emailService.submitForm(formDto);
  }
}
