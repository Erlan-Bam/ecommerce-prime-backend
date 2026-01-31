import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SendEmailFormJobData, EMAIL_QUEUE_NAME } from '../types';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);

  constructor(
    @InjectQueue(EMAIL_QUEUE_NAME) private readonly emailQueue: Queue,
  ) {}

  async addFormJob(data: SendEmailFormJobData): Promise<void> {
    try {
      const job = await this.emailQueue.add('send-email-form', data, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      this.logger.log(
        `Email form job ${job.id} added to queue from ${data.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Error adding email form job: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
