import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { EmailService } from './email.service';
import { EmailQueueService } from './services/email-queue.service';
import { EmailProcessorService } from './services/email-processor.service';
import { EmailService as SharedEmailService } from '../shared/services/email.service';
import { EMAIL_QUEUE_NAME } from './types';

@Module({
  imports: [
    BullModule.registerQueue({
      name: EMAIL_QUEUE_NAME,
    }),
  ],
  providers: [
    EmailService,
    EmailQueueService,
    EmailProcessorService,
    SharedEmailService,
  ],
  exports: [
    EmailService,
    EmailQueueService,
    EmailProcessorService,
    SharedEmailService,
  ],
})
export class EmailModule {}
