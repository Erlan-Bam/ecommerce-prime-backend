export interface SendEmailFormJobData {
  name: string;
  email: string;
  phone?: string;
  message: string;
}

export const EMAIL_QUEUE_NAME = 'email-queue';
