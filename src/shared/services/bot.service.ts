// bot.service.ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { MaintenanceService } from './maintenance.service';
import * as path from 'path';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot;
  private gif: Buffer;

  constructor(
    private configService: ConfigService,
    private maintenanceService: MaintenanceService,
  ) {
    const token = this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.bot = new Bot(token);

    this.bot.catch((err) => {
      const e = err.error as Error;
      this.logger.error('grammY error', e);
    });

    const gifPath = path.join(process.cwd(), 'static', 'start.mp4');
    try {
      this.gif = require('fs').readFileSync(gifPath);
      this.logger.log('Start GIF loaded into memory');
    } catch (error) {
      this.logger.error('Failed to load start GIF', error as Error);
    }

    this.setup();
  }

  private async sendMaintenanceMessage(ctx: any): Promise<boolean> {
    if (this.maintenanceService.getMaintenanceStatus()) {
      const maintenanceMessage = `
🔧 *System Maintenance*

Arctic Pay is currently under maintenance.

We're working hard to improve our services and will be back online shortly.

⏰ Please try again later.

Thank you for your patience! 🙏

For urgent matters, contact support:
💬 @arcticpay\\_support\\_bot`.trim();

      await ctx.reply(maintenanceMessage, {
        parse_mode: 'Markdown',
      });
      return true;
    }
    return false;
  }

  private setup() {
    this.bot.command('start', async (ctx) => {
      if (await this.sendMaintenanceMessage(ctx)) return;

      const url = this.configService.getOrThrow<string>('FRONTEND_URL');

      const user = ctx.from;
      const firstName = user?.first_name || 'Friend';
      const username = user?.username ? `@${user.username}` : '';

      const referralCode = ctx.match ? ctx.match.toString().trim() : null;

      const appUrl = referralCode ? `${url}?ref=${referralCode}` : url;

      // Красивое приветственное сообщение
      const welcomeMessage = `
Hello, ${firstName}! 

🌟 Welcome to Arctic Pay! 🌟

💳 Managing your money is now easy.

✨ What you can do:
🔹 Create virtual cards instantly
🔹 Secure payments worldwide
🔹 Real-time transaction monitoring
🔹 Multi-currency support
🔹 24/7 global acceptance

💸 Fees:
Replenishment: 1.2%
Transaction fee: 0.3 USD
Card issuance fee: 2 USD

🚀 Ready to get started?
Tap the button below to open your Arctic Pay App!

Welcome to Arctic Pay, a new way to manage your finances! 💎

‼️ Follow the referral link use the
“🏦 Open Arctic Pay Wallet” button to create an account ‼️
`.trim();

      const keyboard = new InlineKeyboard()
        .webApp('🏦 Open Arctic Pay Wallet', appUrl)
        .row()
        .url('📞 Support', 'https://t.me/arcticpay_support_bot')
        .url('📖 FAQ', 'https://arcticpay.app/faq');

      try {
        await ctx.replyWithAnimation(new InputFile(this.gif, 'start.mp4'), {
          caption: welcomeMessage,
          reply_markup: keyboard,
          parse_mode: 'Markdown',
        });
      } catch (error) {
        this.logger.error(
          'Failed to send animation, falling back to text',
          error as Error,
        );
        await ctx.reply(welcomeMessage, {
          reply_markup: keyboard,
          parse_mode: 'Markdown',
        });
      }

      this.logger.log(
        `New user started bot: ${firstName} (ID: ${user?.id})${username ? ` ${username}` : ''}${referralCode ? ` [Referred by: ${referralCode}]` : ''}`,
      );
    });

    // Добавляем команду help
    this.bot.command('help', async (ctx) => {
      if (await this.sendMaintenanceMessage(ctx)) return;

      const helpMessage = `
🔧 Arctic Pay Commands

/start - Welcome message and open wallet
/help - Show this help message
/support - Contact support team
/about - Learn more about Arctic Pay

💡 Quick Tips:
• Use the web app for full functionality
• Your data is encrypted and secure
• Need help? Just type /support

🌐 Visit our website: arcticpay.io
      `.trim();

      await ctx.reply(helpMessage, {
        parse_mode: 'Markdown',
      });
    });

    // Добавляем команду support
    this.bot.command('support', async (ctx) => {
      if (await this.sendMaintenanceMessage(ctx)) return;

      const supportMessage = `
🆘 Need Help?

Our support team is here to assist you 24/7!

📞 Contact Options:
• Support Chat: @arcticpay_support_bot
• Email: support@arcticpay.io  
• Help Center: https://arcticpay.app/faq

⏰ Response Time:
We typically respond within 2-4 hours

🔒 Security Note:
Arctic Pay staff will never ask for your passwords or private keys in DMs.
      `.trim();

      const supportKeyboard = new InlineKeyboard()
        .url('💬 Chat with Support', 'https://t.me/arcticpay_support_bot')
        .row()
        .url('📖 FAQ', 'https://arcticpay.app/faq');

      await ctx.reply(supportMessage, {
        reply_markup: supportKeyboard,
        parse_mode: 'Markdown',
      });
    });

    // Добавляем команду about
    this.bot.command('about', async (ctx) => {
      if (await this.sendMaintenanceMessage(ctx)) return;

      const aboutMessage = `
🏢 About Arctic Pay

Arctic Pay is a next-generation financial platform that makes managing your money simple, secure, and globally accessible.

🌍 Our Mission:
To provide clarity in every transaction and help you earn more, consistently.

🏙️ Global Presence:
• Dubai - Financial Hub
• Hong Kong - Technology Center
• Worldwide - Customer Support

💼 Our Expertise:
✅ Advanced Financial Technology
✅ Blockchain Security
✅ Global Payment Processing
✅ Regulatory Compliance

🔐 Security First:
Your funds and data are protected by bank-level encryption and security measures.

🌐 Website: arcticpay.io
📱 App: Available in Telegram
      `.trim();

      await ctx.reply(aboutMessage, {
        parse_mode: 'Markdown',
      });
    });
  }

  async onModuleInit() {
    try {
      this.bot.start({
        drop_pending_updates: true,
        allowed_updates: ['message', 'callback_query'],
        onStart: () => {
          this.logger.log('Telegram bot launched');
        },
      });
    } catch (error) {
      this.logger.error('Failed to launch Telegram bot', error as Error);
      throw error;
    }
  }

  async getBotInfo() {
    try {
      return await this.bot.api.getMe();
    } catch (error) {
      this.logger.error('Failed to get bot info', error as Error);
      throw error;
    }
  }

  async sendMessage(
    chatId: number | string,
    message: string,
    options?: {
      parse_mode?: 'Markdown' | 'HTML';
      disable_web_page_preview?: boolean;
    },
  ) {
    try {
      await this.bot.api.sendMessage(chatId, message, options);
      this.logger.log(`Message sent to user ${chatId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send message to user ${chatId}`,
        error as Error,
      );
      throw error;
    }
  }

  async sendSuccessfulTransactionMessage(
    telegramId: bigint | string,
    amount: number,
    tronId: string,
  ) {
    try {
      const successMessage = `
🎉 *Payment Successful!*

Your payment has been processed successfully.

💰 *Amount:* ${amount.toFixed(2)} USDT
📝 *Transaction ID:* \`${tronId}\`
✅ *Status:* Completed

Your wallet has been topped up! 🚀

Thank you for using Arctic Pay! 💎
      `.trim();

      await this.bot.api.sendMessage(telegramId.toString(), successMessage, {
        parse_mode: 'Markdown',
      });

      this.logger.log(
        `📨 Success message sent to user ${telegramId} for transaction ${tronId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send successful transaction message to user ${telegramId} for transaction ${tronId}`,
        error as Error,
      );
      throw error;
    }
  }

  async sendUnsuccessfulTransactionMessage(
    telegramId: bigint | string,
    amount: number,
    tronId: string,
    errorReason?: string,
  ) {
    try {
      const failureMessage = `
⚠️ *Payment Processing Failed*

We encountered an issue processing your payment.

💰 *Amount:* ${amount.toFixed(2)} USDT
📝 *Transaction ID:* \`${tronId}\`
❌ *Status:* Failed

${errorReason ? `*Reason:* ${errorReason}\n` : ''}
Please contact our support team if you need assistance.

💬 Support: @arcticpay_support_bot
      `.trim();

      await this.bot.api.sendMessage(telegramId.toString(), failureMessage, {
        parse_mode: 'Markdown',
      });

      this.logger.log(
        `📨 Failure message sent to user ${telegramId} for transaction ${tronId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send unsuccessful transaction message to user ${telegramId} for transaction ${tronId}`,
        error as Error,
      );
      throw error;
    }
  }

  async sendResetPasswordCode(telegramId: bigint | string, code: string) {
    try {
      const resetMessage = `
🔐 *Password Reset Request*

Your password reset code is:

🔢 \`${code}\`

⏰ This code will expire in *15 minutes*.

⚠️ *SECURITY WARNING*
If you did not request this password reset, please:
• Ignore this message
• Change your Telegram account password immediately
• Enable two-factor authentication on your Telegram account

🚨 Never share this code with anyone!

ArcticPay staff will NEVER ask for your reset code.

💬 Need help? Contact: @arcticpay\\_support\\_bot
      `.trim();

      await this.bot.api.sendMessage(telegramId.toString(), resetMessage, {
        parse_mode: 'Markdown',
      });

      this.logger.log(`🔐 Password reset code sent to user ${telegramId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send password reset code to user ${telegramId}`,
        error as Error,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    this.bot.stop();
    this.logger.log('Telegram bot stopped');
  }
}
