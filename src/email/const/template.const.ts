import { SendEmailFormJobData } from '../types';

interface EmailTemplates {
  emailForm: {
    title: string;
    nameLabel: string;
    emailLabel: string;
    phoneLabel: string;
    messageLabel: string;
    noPhone: string;
  };
}

export const EMAIL_TEMPLATES: EmailTemplates = {
  emailForm: {
    title: 'Новое сообщение с формы обратной связи',
    nameLabel: 'Имя',
    emailLabel: 'Email',
    phoneLabel: 'Телефон',
    messageLabel: 'Сообщение',
    noPhone: 'Не указан',
  },
};

export const buildEmailFormHtml = (data: SendEmailFormJobData): string => {
  const template = EMAIL_TEMPLATES.emailForm;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
      <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h1 style="color: #333; margin-bottom: 24px; border-bottom: 2px solid #e77d3b; padding-bottom: 12px;">
          ${template.title}
        </h1>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; font-weight: bold; width: 120px;">
              ${template.nameLabel}:
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #333;">
              ${escapeHtml(data.name)}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; font-weight: bold;">
              ${template.emailLabel}:
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #333;">
              <a href="mailto:${escapeHtml(data.email)}" style="color: #e77d3b; text-decoration: none;">
                ${escapeHtml(data.email)}
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #666; font-weight: bold;">
              ${template.phoneLabel}:
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #eee; color: #333;">
              ${data.phone ? `<a href="tel:${escapeHtml(data.phone)}" style="color: #e77d3b; text-decoration: none;">${escapeHtml(data.phone)}</a>` : template.noPhone}
            </td>
          </tr>
        </table>
        
        <div style="margin-top: 24px;">
          <h3 style="color: #666; margin-bottom: 12px;">${template.messageLabel}:</h3>
          <div style="background-color: #f9f9f9; padding: 16px; border-radius: 4px; border-left: 4px solid #e77d3b; color: #333; line-height: 1.6;">
            ${escapeHtml(data.message).replace(/\n/g, '<br>')}
          </div>
        </div>
        
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
          Это автоматическое сообщение с сайта. Пожалуйста, не отвечайте на него напрямую.
        </div>
      </div>
    </body>
    </html>
  `;
};

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
