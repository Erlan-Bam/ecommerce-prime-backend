import { Injectable, Logger } from '@nestjs/common';
import { createTransport, SendMailOptions, Transporter } from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;
  constructor(private readonly configService: ConfigService) {
    this.transporter = createTransport({
      service: 'gmail',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
      debug: true,
    });
  }

  async sendEmail(options: SendMailOptions) {
    try {
      await this.transporter.sendMail(options);

      return { message: 'Email sent successfully' };
    } catch (error) {
      this.logger.error('Error sending email', error);
      throw error;
    }
  }
}
