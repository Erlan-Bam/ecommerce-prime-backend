import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from './shared/services/prisma.service';
import { SmsService } from './shared/services/sms.service';
import { Public } from './shared/decorator/public.decorator';

@ApiTags('App')
@Controller('')
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {}

  @Get('healthz')
  async healthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'connected',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          error: 'Database connection failed',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Public()
  @Post('webhooks/sms-status')
  @ApiOperation({ summary: 'SMSAero delivery status webhook' })
  @ApiResponse({ status: 200, description: 'Webhook received and verified' })
  async smsStatusWebhook(
    @Body() body: { id?: number; status?: number; extendStatus?: string },
  ) {
    const { id, status, extendStatus } = body;

    this.logger.log(
      `SMS webhook received: id=${id}, status=${status}, extendStatus=${extendStatus}`,
    );

    if (!id) {
      this.logger.warn('SMS webhook received without id, ignoring');
      return { success: true, message: 'No SMS id provided' };
    }

    try {
      // Verify the delivery status with SMSAero API
      const verifiedStatus = await this.smsService.checkStatus(id);

      this.logger.log(
        `SMS ${id} verified status: ${verifiedStatus.data?.extendStatus} ` +
          `(status=${verifiedStatus.data?.status}, ` +
          `number=${verifiedStatus.data?.number})`,
      );

      return {
        success: true,
        message: 'Webhook processed and verified',
        verifiedStatus: verifiedStatus.data?.extendStatus,
      };
    } catch (error) {
      this.logger.error(
        `Failed to verify SMS status for id=${id}: ${error?.message}`,
      );

      // Still return 200 to acknowledge the webhook
      return {
        success: true,
        message: 'Webhook received, verification failed',
        webhookData: { id, status, extendStatus },
      };
    }
  }
}
