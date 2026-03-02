import { Injectable, Logger } from '@nestjs/common';
import { SmsService } from '../../shared/services/sms.service';

@Injectable()
export class AuthSmsService {
  private readonly logger = new Logger(AuthSmsService.name);

  constructor(private readonly smsService: SmsService) {}

  async sendVerificationCode(phone: string, code: string): Promise<void> {
    const message = this.buildVerificationMessage(code);
    try {
      await this.smsService.sendSms(phone, message);
      this.logger.log(`Sent verification code to phone: ${phone}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification code to ${phone}: ${error?.message}`,
      );
      throw error;
    }
  }

  private buildVerificationMessage(code: string): string {
    return `Ваш код подтверждения: ${code}. Код действителен 15 минут. Никому не сообщайте этот код.`;
  }
}
