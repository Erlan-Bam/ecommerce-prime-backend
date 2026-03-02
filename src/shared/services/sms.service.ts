import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: AxiosInstance;
  private readonly sign: string;

  constructor(private readonly configService: ConfigService) {
    const email = this.configService.getOrThrow<string>('SMSAERO_EMAIL');
    const apiKey = this.configService.getOrThrow<string>('SMSAERO_API_KEY');

    this.sign = this.configService.get<string>('SMSAERO_SIGN', 'prime-electronics');

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

    const params: Record<string, any> = {
      number,
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

      const errorDetail =
        typeof response.data?.message === 'object'
          ? JSON.stringify(response.data.message)
          : response.data?.message;

      this.logger.error(`SMSAero API error: ${errorDetail}`);
      throw new Error(`SMSAero error: ${errorDetail}`);
    } catch (error) {
      if (error?.response) {
        this.logger.error(`SMSAero HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      } else {
        this.logger.error(`Failed to send SMS to ${number}: ${error?.message || error}`);
      }
      throw error;
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

      this.logger.warn(`SMSAero status check failed for id=${smsId}: ${response.data?.message}`);
      return response.data;
    } catch (error) {
      if (error?.response) {
        this.logger.error(`SMSAero status HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      } else {
        this.logger.error(`Failed to check SMS status for id=${smsId}: ${error?.message || error}`);
      }
      throw error;
    }
  }
}
