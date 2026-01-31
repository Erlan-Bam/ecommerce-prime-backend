import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { FormDto } from './dto';
import { EmailQueueService } from './services/email-queue.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly emailQueueService: EmailQueueService) {}

  async submitForm(dto: FormDto) {
    try {
      this.logger.log(`Processing email form submission from: ${dto.email}`);

      await this.emailQueueService.addFormJob({
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
      });

      this.logger.log(`Email form submitted successfully from: ${dto.email}`);

      return {
        success: true,
        message:
          'Ваше сообщение успешно отправлено. Мы свяжемся с вами в ближайшее время.',
      };
    } catch (error) {
      this.logger.error(
        `Error processing email form: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Не удалось отправить сообщение. Пожалуйста, попробуйте позже.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
