import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TransactionStatus } from '@prisma/client';
import { PrismaService } from 'src/shared/services/prisma.service';
import { ZephyrService } from './zephyr.service';
import { TransactionQueue } from 'src/transaction/transaction.queue';
import { BotService } from './bot.service';

@Injectable()
export class CronService {
  private readonly TRANSACTION_EXPIRE_HOURS = 24 * 60 * 60 * 1000;
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private transactionQueue: TransactionQueue,
    private zephyr: ZephyrService,
    private bot: BotService,
  ) {}

  @Cron(CronExpression.EVERY_2_HOURS)
  async handleExpiredTransactions() {
    try {
      const transactions = await this.prisma.transaction.updateMany({
        where: {
          status: TransactionStatus.PENDING,
          createdAt: {
            lt: new Date(Date.now() - this.TRANSACTION_EXPIRE_HOURS),
          },
        },
        data: { status: TransactionStatus.FAILED },
      });

      this.logger.log(`Expired transactions updated: ${transactions.count}`);
    } catch (error) {
      this.logger.error('Error in handleExpiredTransactions: ' + error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleCommissionUpdate() {
    try {
      await this.transactionQueue.loadTransactionFee();
      this.logger.log('Commission rate cache refreshed successfully');
    } catch (error) {
      this.logger.error('Error in handleCommisionUpdate: ' + error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredTopupApplications() {
    try {
      const now = new Date();
      const { applications } = await this.zephyr.getAllTopupApplications(0);

      const tasks = applications
        .filter(
          (app) =>
            new Date(app.createTime).getTime() <
            now.getTime() - this.TRANSACTION_EXPIRE_HOURS,
        )
        .map(async (app) => {
          try {
            const result = await this.zephyr.rejectTopupApplication(app.id);
            if (result.status === 'error') {
              this.logger.error(
                `Failed to reject topup application: ${app.id}, reason: ${result.message}`,
              );
            } else {
              this.logger.log(`Rejected expired topup application: ${app.id}`);
            }
          } catch (error) {
            this.logger.error(
              `Error rejecting topup application ${app.id}: ` + error,
            );
          }
        });

      await Promise.allSettled(tasks);
    } catch (error) {
      this.logger.error('Error in handleExpiredTopupApplications: ' + error);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredResetPasswordCodes() {
    try {
      const result = await this.prisma.account.updateMany({
        where: {
          resetPasswordExpiry: {
            lt: new Date(),
          },
          resetPasswordCode: {
            not: null,
          },
        },
        data: {
          resetPasswordCode: null,
          resetPasswordExpiry: null,
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Cleaned up ${result.count} expired password reset codes`,
        );
      }
    } catch (error) {
      this.logger.error('Error in handleExpiredResetPasswordCodes: ' + error);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processReferralBonuses() {
    this.logger.log('Starting daily referral bonus processing...');

    try {
      // Get all accounts with pending bonuses >= $10
      const accountsWithBonuses = await this.prisma.bonus.groupBy({
        by: ['accountId'],
        where: {
          status: 'PENDING',
        },
        _sum: {
          amount: true,
        },
        having: {
          amount: {
            _sum: {
              gte: 10,
            },
          },
        },
      });

      this.logger.log(
        `Found ${accountsWithBonuses.length} accounts with bonuses >= $10`,
      );

      for (const bonus of accountsWithBonuses) {
        try {
          await this.processAccountBonus(
            bonus.accountId,
            bonus._sum.amount || 0,
          );
        } catch (error) {
          this.logger.error(
            `Failed to process bonus for account ${bonus.accountId}: ${error}`,
          );
        }
      }

      this.logger.log('Completed daily referral bonus processing');
    } catch (error) {
      this.logger.error(`Error in referral bonus cron job: ${error}`);
    }
  }

  private async processAccountBonus(accountId: string, totalAmount: number) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { childUserId: true, telegramId: true },
    });

    if (!account) {
      this.logger.warn(`Account ${accountId} not found`);
      return;
    }

    this.logger.log(
      `Processing bonus for account ${accountId}, amount: ${totalAmount}`,
    );

    try {
      // Step 1: Create topup application
      const createResult = await this.zephyr.topupWallet(
        account.childUserId,
        totalAmount,
      );

      if (createResult.status !== 'success') {
        await this.sendErrorNotification(
          account.telegramId.toString(),
          totalAmount,
          createResult.message || 'Failed to create topup application',
        );
        return;
      }

      this.logger.log(
        `Topup application created for childUserId=${account.childUserId}`,
      );

      // Step 2: Get the created application
      const { applications } = await this.zephyr.getTopupApplications(
        account.childUserId,
        { page: 1, limit: 5, status: 0 },
      );

      if (!applications || applications.length === 0) {
        await this.sendErrorNotification(
          account.telegramId.toString(),
          totalAmount,
          'Failed to retrieve topup applications',
        );
        return;
      }

      const latestApplication = applications.find(
        (app) => app.amount === totalAmount,
      );

      if (!latestApplication) {
        await this.sendErrorNotification(
          account.telegramId.toString(),
          totalAmount,
          'Failed to find the created topup application',
        );
        return;
      }

      this.logger.log(`Found application with id=${latestApplication.id}`);

      // Step 3: Approve the application
      const approveResult = await this.zephyr.acceptTopupApplication(
        latestApplication.id,
      );

      if (approveResult.status !== 'success') {
        await this.sendErrorNotification(
          account.telegramId.toString(),
          totalAmount,
          approveResult.message || 'Failed to approve topup application',
        );
        return;
      }

      this.logger.log(
        `Application approved for childUserId=${account.childUserId}`,
      );

      // Step 4: Get updated balance
      const balanceResult = await this.zephyr.getAccountBalance(
        account.childUserId,
      );

      // Step 5: Update bonus status to COMPLETED
      await this.prisma.bonus.updateMany({
        where: {
          accountId: accountId,
          status: 'PENDING',
        },
        data: {
          status: 'COMPLETED',
        },
      });

      // Step 6: Send success notification
      await this.sendSuccessNotification(
        account.telegramId.toString(),
        totalAmount,
        balanceResult.balance,
      );

      this.logger.log(`Successfully processed bonus for account ${accountId}`);
    } catch (error) {
      this.logger.error(
        `Error processing bonus for account ${accountId}: ${error}`,
      );
      await this.sendErrorNotification(
        account.telegramId.toString(),
        totalAmount,
        'An unexpected error occurred',
      );
    }
  }

  private async sendSuccessNotification(
    telegramId: string,
    amount: number,
    newBalance: number,
  ) {
    const message = `
🎉 *Referral Bonus Claimed Successfully!*

Your referral bonus has been added to your wallet!

💰 *Amount Credited:* ${amount.toFixed(2)} USDT
💳 *New Balance:* ${newBalance.toFixed(2)} USDT

Thank you for being part of Arctic Pay! 💎
    `.trim();

    try {
      await this.bot.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send success notification to ${telegramId}: ${error}`,
      );
    }
  }

  private async sendErrorNotification(
    telegramId: string,
    amount: number,
    errorMessage: string,
  ) {
    const message = `
⚠️ *Referral Bonus Processing Failed*

We encountered an issue while processing your referral bonus.

💰 *Amount:* ${amount.toFixed(2)} USDT
❌ *Error:* ${errorMessage}

Please contact support if this issue persists.
    `.trim();

    try {
      await this.bot.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send error notification to ${telegramId}: ${error}`,
      );
    }
  }
}
