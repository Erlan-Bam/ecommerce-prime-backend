import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    try {
      // Получаем дату начала предыдущего месяца для сравнения
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonthStart = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const previousMonthEnd = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
      );

      // Запросы для текущего периода
      const [
        totalRevenue,
        previousRevenue,
        totalOrders,
        previousOrders,
        totalProducts,
        previousProducts,
        totalUsers,
        previousUsers,
      ] = await Promise.all([
        // Общая выручка (текущий месяц)
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED'] },
            createdAt: { gte: currentMonthStart },
          },
          _sum: { finalTotal: true },
        }),
        // Выручка за предыдущий месяц
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED'] },
            createdAt: {
              gte: previousMonthStart,
              lte: previousMonthEnd,
            },
          },
          _sum: { finalTotal: true },
        }),
        // Количество заказов (текущий месяц)
        this.prisma.order.count({
          where: {
            createdAt: { gte: currentMonthStart },
          },
        }),
        // Количество заказов (предыдущий месяц)
        this.prisma.order.count({
          where: {
            createdAt: {
              gte: previousMonthStart,
              lte: previousMonthEnd,
            },
          },
        }),
        // Количество товаров (текущие)
        this.prisma.product.count({
          where: { isActive: true },
        }),
        // Количество товаров на начало месяца (приблизительно)
        this.prisma.product.count({
          where: {
            isActive: true,
            createdAt: { lt: currentMonthStart },
          },
        }),
        // Количество пользователей (текущие)
        this.prisma.user.count(),
        // Количество пользователей на начало месяца
        this.prisma.user.count({
          where: {
            createdAt: { lt: currentMonthStart },
          },
        }),
      ]);

      // Вычисляем проценты изменений
      const revenueChange = this.calculatePercentageChange(
        totalRevenue._sum.finalTotal?.toNumber() || 0,
        previousRevenue._sum.finalTotal?.toNumber() || 0,
      );

      const ordersChange = this.calculatePercentageChange(
        totalOrders,
        previousOrders,
      );

      const productsChange = this.calculatePercentageChange(
        totalProducts,
        previousProducts,
      );

      const usersChange = this.calculatePercentageChange(
        totalUsers,
        previousUsers,
      );

      return {
        revenue: {
          value: totalRevenue._sum.finalTotal?.toNumber() || 0,
          change: revenueChange,
          changeType: revenueChange >= 0 ? 'positive' : 'negative',
        },
        orders: {
          value: totalOrders,
          change: ordersChange,
          changeType: ordersChange >= 0 ? 'positive' : 'negative',
        },
        products: {
          value: totalProducts,
          change: productsChange,
          changeType: productsChange >= 0 ? 'positive' : 'negative',
        },
        users: {
          value: totalUsers,
          change: usersChange,
          changeType: usersChange >= 0 ? 'positive' : 'negative',
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting dashboard stats: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getRecentOrders(limit = 5) {
    try {
      const orders = await this.prisma.order.findMany({
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      return orders.map((order) => ({
        id: order.id,
        customer: order.email,
        amount: order.finalTotal.toNumber(),
        status: this.mapStatus(order.status),
        statusType: this.getStatusType(order.status),
        createdAt: order.createdAt,
      }));
    } catch (error) {
      this.logger.error(
        `Error getting recent orders: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  private mapStatus(status: string): string {
    const statusMap: Record<string, string> = {
      PENDING: 'В обработке',
      PROCESSING: 'В обработке',
      CONFIRMED: 'Подтвержден',
      SHIPPED: 'Отправлен',
      DELIVERED: 'Доставлен',
      CANCELLED: 'Отменен',
      PICKUP_READY: 'Готов к выдаче',
      PICKED_UP: 'Получен',
    };
    return statusMap[status] || status;
  }

  private getStatusType(
    status: string,
  ): 'success' | 'warning' | 'info' | 'danger' {
    const typeMap: Record<string, 'success' | 'warning' | 'info' | 'danger'> = {
      PENDING: 'warning',
      PROCESSING: 'warning',
      CONFIRMED: 'info',
      SHIPPED: 'info',
      DELIVERED: 'success',
      CANCELLED: 'danger',
      PICKUP_READY: 'info',
      PICKED_UP: 'success',
    };
    return typeMap[status] || 'info';
  }
}
