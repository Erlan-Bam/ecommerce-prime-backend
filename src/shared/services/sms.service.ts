import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: AxiosInstance;
  private readonly sign: string;

  constructor(private readonly configService: ConfigService) {
    const email = this.configService.getOrThrow<string>('SMSAERO_EMAIL');
    const apiKey = this.configService.getOrThrow<string>('SMSAERO_API_KEY');

    // SMSAero sign must be ≤11 characters
    this.sign = this.configService.get<string>('SMSAERO_SIGN', 'prime');

    this.client = axios.create({
      baseURL: 'https://gate.smsaero.ru/v2',
      auth: {
        username: email,
        password: apiKey,
      },
    });
  }

  /**
   * Send an SMS via SMSAero sms/send endpoint.
   * @param number Phone number (e.g. 79990000000)
   * @param text   Message text
   * @returns SMSAero response data
   */
  async sendSms(
    number: string,
    text: string,
  ): Promise<{ success: boolean; data: any; message: string | null }> {
    const callbackUrl = this.configService.get<string>('SMSAERO_CALLBACK_URL');

    // SMSAero expects numbers without leading '+'
    const cleanNumber = number.replace(/^\+/, '');

    const params: Record<string, any> = {
      number: cleanNumber,
      text,
      sign: this.sign,
    };

    if (callbackUrl) {
      params.callbackUrl = callbackUrl;
      params.callbackFormat = 'JSON';
    }

    try {
      this.logger.log(`Sending SMS to ${number} (${text.length} chars)`);

      const response = await this.client.get('/sms/send', { params });

      if (response.data?.success) {
        this.logger.log(`SMS sent successfully to ${number}`);
        return response.data;
      }

      const errorDetail = this.extractErrorDetail(response.data);
      this.logger.error(`SMSAero API error for ${number}: ${errorDetail}`);
      throw new HttpException(
        `SMS delivery failed: ${errorDetail}`,
        HttpStatus.BAD_GATEWAY,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.handleAxiosError(error, `send SMS to ${number}`);
    }
  }

  /**
   * Check SMS delivery status via SMSAero sms/status endpoint.
   * @param smsId The SMS id returned by sms/send
   * @returns SMSAero status response data
   */
  async checkStatus(
    smsId: number,
  ): Promise<{ success: boolean; data: any; message: string | null }> {
    try {
      this.logger.log(`Checking SMS status for id=${smsId}`);

      const response = await this.client.get('/sms/status', {
        params: { id: smsId },
      });

      if (response.data?.success) {
        this.logger.log(
          `SMS ${smsId} status: ${response.data.data?.extendStatus} (status=${response.data.data?.status})`,
        );
        return response.data;
      }

      this.logger.warn(
        `SMSAero status check unsuccessful for id=${smsId}: ${response.data?.message}`,
      );
      return response.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.handleAxiosError(error, `check status for SMS id=${smsId}`);
    }
  }

  private extractErrorDetail(responseData: any): string {
    const msg = responseData?.message;
    const data = responseData?.data;

    if (typeof msg === 'string' && msg) return msg;

    if (data && typeof data === 'object') {
      const fieldErrors = Object.entries(data)
        .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
        .join('; ');
      if (fieldErrors) return fieldErrors;
    }

    return JSON.stringify(responseData);
  }

  private handleAxiosError(error: unknown, context: string): never {
    const axiosErr = error as AxiosError<any>;

    if (axiosErr.response) {
      const status = axiosErr.response.status;
      const detail = this.extractErrorDetail(axiosErr.response.data);

      this.logger.error(`SMSAero HTTP ${status} while trying to ${context}: ${detail}`);

      throw new HttpException(
        `SMSAero error (${status}): ${detail}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Network / timeout error
    this.logger.error(`SMSAero network error while trying to ${context}: ${axiosErr.message}`);
    throw new HttpException(
      'SMS provider unreachable. Please try again later.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
