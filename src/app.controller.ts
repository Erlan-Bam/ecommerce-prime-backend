import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
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

  /**
   * sms.ru webhook handler.
   *
   * sms.ru sends POST form-encoded data with fields:
   *   data[1], data[2], ... data[100] — multi-line text entries
   *   hash — SHA-256(api_id + concatenated data entries)
   *
   * Each data entry has lines:
   *   line 0: type (e.g. "sms_status" or "callcheck_status")
   *   line 1: id (sms_id or check_id)
   *   line 2: status code
   *   line 3: unix timestamp
   *
   * The handler MUST respond with plain text "100" to signal success.
   */
  @Public()
  @Post('webhooks/sms-status')
  @ApiOperation({ summary: 'sms.ru delivery status webhook' })
  @ApiResponse({
    status: 200,
    description: 'Returns plain text "100" to acknowledge',
  })
  async smsStatusWebhook(
    @Body() body: Record<string, any>,
    @Res() res: Response,
  ) {
    // Collect all data[N] entries in order
    const dataEntries: string[] = [];
    for (let i = 1; i <= 100; i++) {
      const key =
        body[`data[${i}]`] ?? body?.data?.[i] ?? body?.data?.[String(i)];
      if (key !== undefined && key !== null) {
        dataEntries.push(String(key));
      }
    }

    if (dataEntries.length === 0) {
      this.logger.warn('SMS webhook received with no data entries, ignoring');
      return res.status(200).type('text/plain').send('100');
    }

    // Verify hash
    const receivedHash = body.hash ?? body['hash'];
    if (receivedHash) {
      const valid = this.smsService.verifyWebhookHash(
        dataEntries,
        receivedHash,
      );
      if (!valid) {
        this.logger.error('SMS webhook hash verification failed');
        return res.status(200).type('text/plain').send('100');
      }
      this.logger.log('SMS webhook hash verified successfully');
    } else {
      this.logger.warn('SMS webhook received without hash field');
    }

    // Process each data entry
    for (const entry of dataEntries) {
      const lines = entry.split('\n');
      const type = lines[0]?.trim();

      switch (type) {
        case 'sms_status': {
          const smsId = lines[1]?.trim();
          const statusCode = lines[2]?.trim();
          const timestamp = lines[3]?.trim();

          this.logger.log(
            `SMS status update: sms_id=${smsId}, status=${statusCode}, time=${timestamp}`,
          );

          // Optionally verify via API
          if (smsId) {
            try {
              const verified = await this.smsService.checkStatus(smsId);
              this.logger.log(
                `SMS ${smsId} verified: [${verified.data?.status_code}] ${verified.data?.status_text}`,
              );
            } catch (error) {
              this.logger.error(
                `Failed to verify SMS status for id=${smsId}: ${error?.message}`,
              );
            }
          }
          break;
        }

        case 'callcheck_status': {
          const checkId = lines[1]?.trim();
          const checkStatus = lines[2]?.trim();
          const timestamp = lines[3]?.trim();

          this.logger.log(
            `Call-check status: check_id=${checkId}, status=${checkStatus}, time=${timestamp}`,
          );

          if (checkStatus === '401') {
            this.logger.log(
              `Call-check ${checkId}: auth passed (call received)`,
            );
          } else if (checkStatus === '402') {
            this.logger.warn(
              `Call-check ${checkId}: auth expired (no call received)`,
            );
          }
          break;
        }

        default:
          this.logger.warn(`Unknown webhook entry type: "${type}"`);
      }
    }

    // sms.ru requires plain text "100" response
    return res.status(200).type('text/plain').send('100');
  }
}
