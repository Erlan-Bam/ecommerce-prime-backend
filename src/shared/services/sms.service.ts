import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';

/**
 * SMS provider: sms.ru
 * Docs: https://sms.ru/api/send
 *
 * Environment variables:
 *   SMSRU_API_ID   – (required) your personal api_id from sms.ru dashboard
 *   SMSRU_FROM     – (optional) agreed sender name
 *   SMSRU_TEST_MODE – set "true" to send with test=1 (no actual delivery, no balance charge)
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiId: string;
  private readonly from?: string;
  private readonly testMode: boolean;

  private static readonly BASE_URL = 'https://sms.ru/sms';

  constructor(private readonly configService: ConfigService) {
    this.apiId = this.configService.getOrThrow<string>('SMSRU_API_ID');
    this.from = this.configService.get<string>('SMSRU_FROM');
    this.testMode =
      this.configService.get<string>('SMSRU_TEST_MODE', 'false') === 'true';
  }

  /* ------------------------------------------------------------------ */
  /*  Public helpers used by the webhook                                 */
  /* ------------------------------------------------------------------ */

  /** Compute the SHA-256 hash that sms.ru sends alongside webhook data. */
  verifyWebhookHash(dataEntries: string[], receivedHash: string): boolean {
    const concat = dataEntries.join('');
    const expected = crypto
      .createHash('sha256')
      .update(this.apiId + concat)
      .digest('hex');
    return expected === receivedHash;
  }

  /* ------------------------------------------------------------------ */
  /*  Send SMS                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Send an SMS via sms.ru /sms/send endpoint.
   * @param number Phone number (e.g. +79990000000 or 79990000000)
   * @param text   Message text (UTF-8)
   * @returns Object with sms_id (string) on success
   */
  async sendSms(
    number: string,
    text: string,
  ): Promise<{ success: boolean; data: any; message: string | null }> {
    // sms.ru expects digits without leading '+'
    const phone = number.replace(/^\+/, '');

    const params: Record<string, any> = {
      api_id: this.apiId,
      to: phone,
      msg: text,
      json: 1,
    };

    if (this.from) {
      params.from = this.from;
    }

    if (this.testMode) {
      params.test = 1;
    }

    try {
      this.logger.log(
        `Sending SMS to ${phone} (${text.length} chars)${this.testMode ? ' [TEST MODE]' : ''}`,
      );

      const response = await axios.get(`${SmsService.BASE_URL}/send`, {
        params,
      });

      const body = response.data;

      // Top-level check
      if (body?.status !== 'OK' || body?.status_code !== 100) {
        const errText = body?.status_text || JSON.stringify(body);
        this.logger.error(`sms.ru API error for ${phone}: ${errText}`);
        throw new HttpException(
          `SMS delivery failed: ${errText}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      // Per-number result
      const smsEntry = body.sms?.[phone];
      if (smsEntry?.status === 'ERROR') {
        this.logger.error(
          `sms.ru rejected ${phone}: [${smsEntry.status_code}] ${smsEntry.status_text}`,
        );
        throw new HttpException(
          `SMS rejected for ${phone}: ${smsEntry.status_text}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      this.logger.log(
        `SMS sent to ${phone}, sms_id=${smsEntry?.sms_id}, balance=${body.balance}`,
      );

      return {
        success: true,
        data: {
          sms_id: smsEntry?.sms_id,
          balance: body.balance,
          phone,
        },
        message: null,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.handleAxiosError(error, `send SMS to ${phone}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Check delivery status                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Check SMS delivery status via sms.ru /sms/status endpoint.
   * @param smsId The sms_id string returned by sms/send (e.g. "000000-10000000")
   */
  async checkStatus(
    smsId: string,
  ): Promise<{ success: boolean; data: any; message: string | null }> {
    try {
      this.logger.log(`Checking SMS status for id=${smsId}`);

      const response = await axios.get(`${SmsService.BASE_URL}/status`, {
        params: {
          api_id: this.apiId,
          sms_id: smsId,
          json: 1,
        },
      });

      const body = response.data;

      if (body?.status !== 'OK' || body?.status_code !== 100) {
        const errText = body?.status_text || JSON.stringify(body);
        this.logger.warn(
          `sms.ru status check unsuccessful for id=${smsId}: ${errText}`,
        );
        return { success: false, data: body, message: errText };
      }

      const smsEntry = body.sms?.[smsId];
      this.logger.log(
        `SMS ${smsId} status: [${smsEntry?.status_code}] ${smsEntry?.status_text}`,
      );

      return {
        success: smsEntry?.status === 'OK',
        data: {
          sms_id: smsId,
          status_code: smsEntry?.status_code,
          status_text: smsEntry?.status_text,
          cost: smsEntry?.cost,
        },
        message: smsEntry?.status_text || null,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.handleAxiosError(error, `check status for SMS id=${smsId}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Error helpers                                                      */
  /* ------------------------------------------------------------------ */

  private handleAxiosError(error: unknown, context: string): never {
    const axiosErr = error as AxiosError<any>;

    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const detail =
        axiosErr.response.data?.status_text ||
        JSON.stringify(axiosErr.response.data);

      this.logger.error(
        `sms.ru HTTP ${status} while trying to ${context}: ${detail}`,
      );

      throw new HttpException(
        `sms.ru error (${status}): ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Network / timeout error
    this.logger.error(
      `sms.ru network error while trying to ${context}: ${axiosErr.message}`,
    );
    throw new HttpException(
      'SMS provider unreachable. Please try again later.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
