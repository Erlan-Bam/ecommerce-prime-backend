import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';

export interface LoyaltyTier {
  name: string;
  cashbackRate: number;
  minSpent: number;
}

const LOYALTY_TIERS: LoyaltyTier[] = [
  { name: 'Стандарт', cashbackRate: 0.01, minSpent: 0 },
  { name: 'Премиум', cashbackRate: 0.015, minSpent: 500_000 },
];

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get current loyalty tier based on total spent
   */
  getTier(totalSpent: number): LoyaltyTier {
    // Return matching tier (highest threshold that user has passed)
    for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
      if (totalSpent >= LOYALTY_TIERS[i].minSpent) {
        return LOYALTY_TIERS[i];
      }
    }
    return LOYALTY_TIERS[0];
  }

  /**
   * Get next loyalty tier (or null if already max)
   */
  getNextTier(totalSpent: number): LoyaltyTier | null {
    const currentTier = this.getTier(totalSpent);
    const currentIndex = LOYALTY_TIERS.indexOf(currentTier);
    if (currentIndex < LOYALTY_TIERS.length - 1) {
      return LOYALTY_TIERS[currentIndex + 1];
    }
    return null;
  }

  /**
   * Calculate bonus balance for a user (sum of all INCREASE - sum of all DECREASE)
   */
  async getBalance(userId: string): Promise<number> {
    const result = await this.prisma.bonus.groupBy({
      by: ['type'],
      where: { userId },
      _sum: { amount: true },
    });

    let balance = 0;
    for (const group of result) {
      const amount = group._sum.amount ? Number(group._sum.amount) : 0;
      if (group.type === 'INCREASE') {
        balance += amount;
      } else {
        balance -= amount;
      }
    }

    return Math.max(0, Math.round(balance));
  }

  /**
   * Get full loyalty info for a user
   */
  async getLoyaltyInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totalSpent: true },
    });

    const totalSpent = user ? Number(user.totalSpent) : 0;
    const balance = await this.getBalance(userId);
    const tier = this.getTier(totalSpent);
    const nextTier = this.getNextTier(totalSpent);

    return {
      balance,
      totalSpent,
      tier: {
        name: tier.name,
        cashbackRate: tier.cashbackRate,
        cashbackPercent: `${(tier.cashbackRate * 100).toFixed(1)}%`,
      },
      nextTier: nextTier
        ? {
            name: nextTier.name,
            cashbackRate: nextTier.cashbackRate,
            cashbackPercent: `${(nextTier.cashbackRate * 100).toFixed(1)}%`,
            minSpent: nextTier.minSpent,
            remaining: Math.max(0, nextTier.minSpent - totalSpent),
          }
        : null,
    };
  }

  /**
   * Get bonus transaction history for a user
   */
  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.bonus.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              finalTotal: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.bonus.count({ where: { userId } }),
    ]);

    return {
      data: data.map((b) => ({
        id: b.id,
        amount: Number(b.amount),
        type: b.type,
        description: b.description,
        orderId: b.orderId,
        orderTotal: b.order ? Number(b.order.finalTotal) : null,
        createdAt: b.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Accrue cashback for a finalized order.
   * Called inside the order finalization transaction.
   */
  async accrueCashback(
    tx: any,
    userId: string,
    orderId: number,
    orderTotal: number,
  ) {
    // Get user's totalSpent to determine tier
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { totalSpent: true },
    });

    const totalSpent = user ? Number(user.totalSpent) : 0;
    const tier = this.getTier(totalSpent);
    const cashbackAmount = Math.floor(orderTotal * tier.cashbackRate);

    if (cashbackAmount <= 0) return { cashbackAmount: 0 };

    // Create bonus record
    await tx.bonus.create({
      data: {
        userId,
        orderId,
        amount: cashbackAmount,
        type: 'INCREASE',
        description: `Кешбэк ${(tier.cashbackRate * 100).toFixed(1)}% за заказ #${orderId}`,
      },
    });

    // Update order with earned bonus
    await tx.order.update({
      where: { id: orderId },
      data: { bonusEarned: cashbackAmount },
    });

    // Update user totalSpent
    await tx.user.update({
      where: { id: userId },
      data: {
        totalSpent: { increment: orderTotal },
      },
    });

    this.logger.log(
      `Accrued ${cashbackAmount} bonus for user ${userId} on order ${orderId} (rate: ${tier.cashbackRate})`,
    );

    return { cashbackAmount };
  }

  /**
   * Calculate cashback preview (for checkout page — doesn't save anything)
   */
  async previewCashback(userId: string, orderTotal: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { totalSpent: true },
    });

    const totalSpent = user ? Number(user.totalSpent) : 0;
    const tier = this.getTier(totalSpent);
    const cashbackAmount = Math.floor(orderTotal * tier.cashbackRate);

    return {
      cashbackAmount,
      cashbackRate: tier.cashbackRate,
      cashbackPercent: `${(tier.cashbackRate * 100).toFixed(1)}%`,
      tierName: tier.name,
    };
  }
}
