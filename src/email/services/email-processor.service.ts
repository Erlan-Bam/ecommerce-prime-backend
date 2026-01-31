import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../shared/services/email.service';
import { SendEmailFormJobData, EMAIL_QUEUE_NAME } from '../types';
import { buildEmailFormHtml } from '../const/template.const';

@Processor(EMAIL_QUEUE_NAME)
export class EmailProcessorService {
  private readonly logger = new Logger(EmailProcessorService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @Process('send-email-form')
  async processEmailForm(job: Job<SendEmailFormJobData>): Promise<void> {
    try {
      this.logger.log(
        `Processing email form job ${job.id} from ${job.data.email}`,
      );

      const html = buildEmailFormHtml(job.data);
      const emailUser = this.configService.get<string>('EMAIL_USER');

      await this.emailService.sendEmail({
        from: emailUser,
        to: emailUser,
        replyTo: job.data.email,
        subject: `Сообщение с сайта от ${job.data.name}`,
        html,
      });

      this.logger.log(`Email form job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(
        `Error processing email form job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
