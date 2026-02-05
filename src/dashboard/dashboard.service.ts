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

  /**
   * Get analytics with comparison across different time periods
   */
  async getPeriodAnalytics(period: 'day' | 'week' | 'month' = 'month') {
    try {
      const now = new Date();
      const { currentStart, previousStart, previousEnd } =
        this.getPeriodDates(period);

      const [
        currentRevenue,
        previousRevenue,
        currentOrders,
        previousOrders,
        currentUsers,
        previousUsers,
        currentAvgOrderValue,
        previousAvgOrderValue,
      ] = await Promise.all([
        // Current period revenue
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED', 'PAYED'] },
            createdAt: { gte: currentStart },
          },
          _sum: { finalTotal: true },
        }),
        // Previous period revenue
        this.prisma.order.aggregate({
          where: {
            status: { in: ['DELIVERED', 'SHIPPED', 'PAYED'] },
            createdAt: { gte: previousStart, lt: previousEnd },
          },
          _sum: { finalTotal: true },
        }),
        // Current period orders
        this.prisma.order.count({
          where: { createdAt: { gte: currentStart } },
        }),
        // Previous period orders
        this.prisma.order.count({
          where: { createdAt: { gte: previousStart, lt: previousEnd } },
        }),
        // New users current period
        this.prisma.user.count({
          where: { createdAt: { gte: currentStart } },
        }),
        // New users previous period
        this.prisma.user.count({
          where: { createdAt: { gte: previousStart, lt: previousEnd } },
        }),
        // Average order value current period
        this.prisma.order.aggregate({
          where: { createdAt: { gte: currentStart } },
          _avg: { finalTotal: true },
        }),
        // Average order value previous period
        this.prisma.order.aggregate({
          where: { createdAt: { gte: previousStart, lt: previousEnd } },
          _avg: { finalTotal: true },
        }),
      ]);

      return {
        period,
        periodLabel: this.getPeriodLabel(period),
        revenue: {
          current: currentRevenue._sum.finalTotal?.toNumber() || 0,
          previous: previousRevenue._sum.finalTotal?.toNumber() || 0,
          change: this.calculatePercentageChange(
            currentRevenue._sum.finalTotal?.toNumber() || 0,
            previousRevenue._sum.finalTotal?.toNumber() || 0,
          ),
        },
        orders: {
          current: currentOrders,
          previous: previousOrders,
          change: this.calculatePercentageChange(currentOrders, previousOrders),
        },
        newUsers: {
          current: currentUsers,
          previous: previousUsers,
          change: this.calculatePercentageChange(currentUsers, previousUsers),
        },
        avgOrderValue: {
          current: currentAvgOrderValue._avg.finalTotal?.toNumber() || 0,
          previous: previousAvgOrderValue._avg.finalTotal?.toNumber() || 0,
          change: this.calculatePercentageChange(
            currentAvgOrderValue._avg.finalTotal?.toNumber() || 0,
            previousAvgOrderValue._avg.finalTotal?.toNumber() || 0,
          ),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting period analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get payment methods breakdown
   */
  async getPaymentMethodsAnalytics() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [paymentMethods, totalOrders] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['paymentMethod'],
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
          _sum: { finalTotal: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      const methodLabels: Record<string, string> = {
        ROBOKASSA: 'Онлайн оплата (Robokassa)',
        CASH: 'Наличными при получении',
      };

      const methodColors: Record<string, string> = {
        ROBOKASSA: '#4F46E5',
        CASH: '#10B981',
      };

      return {
        breakdown: paymentMethods.map((pm) => ({
          method: pm.paymentMethod,
          label: methodLabels[pm.paymentMethod] || pm.paymentMethod,
          count: pm._count.id,
          revenue: pm._sum.finalTotal?.toNumber() || 0,
          percentage:
            totalOrders > 0
              ? Number(((pm._count.id / totalOrders) * 100).toFixed(1))
              : 0,
          color: methodColors[pm.paymentMethod] || '#6B7280',
        })),
        total: totalOrders,
        mostUsed:
          paymentMethods.length > 0
            ? paymentMethods.reduce((a, b) =>
                a._count.id > b._count.id ? a : b,
              ).paymentMethod
            : null,
      };
    } catch (error) {
      this.logger.error(
        `Error getting payment methods analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get order status distribution
   */
  async getOrderStatusAnalytics() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [statusDistribution, totalOrders] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['status'],
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      const statusColors: Record<string, string> = {
        PENDING: '#F59E0B',
        PROCESSING: '#3B82F6',
        PAYED: '#8B5CF6',
        SHIPPED: '#06B6D4',
        DELIVERED: '#10B981',
        CANCELLED: '#EF4444',
      };

      return {
        distribution: statusDistribution.map((sd) => ({
          status: sd.status,
          label: this.mapStatus(sd.status),
          count: sd._count.id,
          percentage:
            totalOrders > 0
              ? Number(((sd._count.id / totalOrders) * 100).toFixed(1))
              : 0,
          color: statusColors[sd.status] || '#6B7280',
          type: this.getStatusType(sd.status),
        })),
        total: totalOrders,
      };
    } catch (error) {
      this.logger.error(
        `Error getting order status analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get delivery method distribution
   */
  async getDeliveryMethodsAnalytics() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [deliveryMethods, totalOrders] = await Promise.all([
        this.prisma.order.groupBy({
          by: ['deliveryMethod'],
          where: {
            createdAt: { gte: thirtyDaysAgo },
          },
          _count: { id: true },
          _sum: { finalTotal: true },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
      ]);

      const methodLabels: Record<string, string> = {
        PICKUP: 'Самовывоз',
        DELIVERY: 'Доставка',
      };

      const methodColors: Record<string, string> = {
        PICKUP: '#8B5CF6',
        DELIVERY: '#F59E0B',
      };

      return {
        breakdown: deliveryMethods.map((dm) => ({
          method: dm.deliveryMethod,
          label: methodLabels[dm.deliveryMethod] || dm.deliveryMethod,
          count: dm._count.id,
          revenue: dm._sum.finalTotal?.toNumber() || 0,
          percentage:
            totalOrders > 0
              ? Number(((dm._count.id / totalOrders) * 100).toFixed(1))
              : 0,
          color: methodColors[dm.deliveryMethod] || '#6B7280',
        })),
        total: totalOrders,
      };
    } catch (error) {
      this.logger.error(
        `Error getting delivery methods analytics: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get revenue trend over time for charts
   */
  async getRevenueTrend(days: number = 30) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      const orders = await this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate },
          status: { in: ['DELIVERED', 'SHIPPED', 'PAYED'] },
        },
        select: {
          createdAt: true,
          finalTotal: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by date
      const dailyRevenue = new Map<string, number>();
      const dailyOrders = new Map<string, number>();

      // Initialize all days with 0
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        dailyRevenue.set(dateKey, 0);
        dailyOrders.set(dateKey, 0);
      }

      // Aggregate orders by date
      orders.forEach((order) => {
        const dateKey = order.createdAt.toISOString().split('T')[0];
        dailyRevenue.set(
          dateKey,
          (dailyRevenue.get(dateKey) || 0) + order.finalTotal.toNumber(),
        );
        dailyOrders.set(dateKey, (dailyOrders.get(dateKey) || 0) + 1);
      });

      const trend = Array.from(dailyRevenue.entries()).map(
        ([date, revenue]) => ({
          date,
          revenue: Number(revenue.toFixed(2)),
          orders: dailyOrders.get(date) || 0,
        }),
      );

      const totalRevenue = trend.reduce((sum, day) => sum + day.revenue, 0);
      const totalOrders = trend.reduce((sum, day) => sum + day.orders, 0);
      const avgDailyRevenue = totalRevenue / days;
      const avgDailyOrders = totalOrders / days;

      return {
        trend,
        summary: {
          totalRevenue: Number(totalRevenue.toFixed(2)),
          totalOrders,
          avgDailyRevenue: Number(avgDailyRevenue.toFixed(2)),
          avgDailyOrders: Number(avgDailyOrders.toFixed(2)),
          peakDay: trend.reduce(
            (max, day) => (day.revenue > max.revenue ? day : max),
            trend[0],
          ),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting revenue trend: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get top selling products
   */
  async getTopProducts(limit: number = 10) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const topProducts = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: {
            createdAt: { gte: thirtyDaysAgo },
            status: { notIn: ['CANCELLED'] },
          },
        },
        _sum: { quantity: true, price: true },
        _count: { id: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: limit,
      });

      const productIds = topProducts.map((p) => p.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          images: { take: 1, select: { url: true } },
        },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      return topProducts.map((tp, index) => {
        const product = productMap.get(tp.productId);
        return {
          rank: index + 1,
          productId: tp.productId,
          name: product?.name || 'Unknown',
          slug: product?.slug,
          image: product?.images[0]?.url,
          unitsSold: tp._sum.quantity || 0,
          revenue: tp._sum.price?.toNumber() || 0,
          ordersCount: tp._count.id,
        };
      });
    } catch (error) {
      this.logger.error(
        `Error getting top products: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get top categories by revenue
   */
  async getTopCategories(limit: number = 10) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get order items with product categories
      const orderItems = await this.prisma.orderItem.findMany({
        where: {
          order: {
            createdAt: { gte: thirtyDaysAgo },
            status: { notIn: ['CANCELLED'] },
          },
        },
        select: {
          quantity: true,
          price: true,
          product: {
            select: {
              categories: {
                where: { isPrimary: true },
                select: {
                  category: {
                    select: { id: true, title: true, slug: true },
                  },
                },
                take: 1,
              },
            },
          },
        },
      });

      // Aggregate by category
      const categoryStats = new Map<
        string,
        { title: string; slug: string; revenue: number; units: number }
      >();

      orderItems.forEach((item) => {
        const primaryCategory = item.product.categories[0]?.category;
        if (primaryCategory) {
          const existing = categoryStats.get(primaryCategory.id) || {
            title: primaryCategory.title,
            slug: primaryCategory.slug,
            revenue: 0,
            units: 0,
          };
          existing.revenue += item.price.toNumber() * item.quantity;
          existing.units += item.quantity;
          categoryStats.set(primaryCategory.id, existing);
        }
      });

      const sortedCategories = Array.from(categoryStats.entries())
        .map(([id, stats]) => ({
          categoryId: id,
          ...stats,
          revenue: Number(stats.revenue.toFixed(2)),
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);

      const totalRevenue = sortedCategories.reduce(
        (sum, cat) => sum + cat.revenue,
        0,
      );

      return sortedCategories.map((cat, index) => ({
        rank: index + 1,
        ...cat,
        percentage:
          totalRevenue > 0
            ? Number(((cat.revenue / totalRevenue) * 100).toFixed(1))
            : 0,
      }));
    } catch (error) {
      this.logger.error(
        `Error getting top categories: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get hourly order distribution for heatmap
   */
  async getOrderHeatmap() {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const orders = await this.prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true },
      });

      // Initialize heatmap: 7 days x 24 hours
      const heatmap: number[][] = Array(7)
        .fill(null)
        .map(() => Array(24).fill(0));

      orders.forEach((order) => {
        const dayOfWeek = order.createdAt.getDay(); // 0 = Sunday
        const hour = order.createdAt.getHours();
        heatmap[dayOfWeek][hour]++;
      });

      const dayLabels = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

      return {
        data: heatmap.map((hours, dayIndex) => ({
          day: dayLabels[dayIndex],
          dayIndex,
          hours: hours.map((count, hourIndex) => ({
            hour: hourIndex,
            count,
          })),
        })),
        maxValue: Math.max(...heatmap.flat()),
        totalOrders: orders.length,
      };
    } catch (error) {
      this.logger.error(
        `Error getting order heatmap: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get comprehensive analytics overview
   */
  async getAnalyticsOverview() {
    try {
      const [
        periodDay,
        periodWeek,
        periodMonth,
        paymentMethods,
        orderStatus,
        deliveryMethods,
      ] = await Promise.all([
        this.getPeriodAnalytics('day'),
        this.getPeriodAnalytics('week'),
        this.getPeriodAnalytics('month'),
        this.getPaymentMethodsAnalytics(),
        this.getOrderStatusAnalytics(),
        this.getDeliveryMethodsAnalytics(),
      ]);

      return {
        comparisons: {
          day: periodDay,
          week: periodWeek,
          month: periodMonth,
        },
        paymentMethods,
        orderStatus,
        deliveryMethods,
      };
    } catch (error) {
      this.logger.error(
        `Error getting analytics overview: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private getPeriodDates(period: 'day' | 'week' | 'month') {
    const now = new Date();
    let currentStart: Date;
    let previousStart: Date;
    let previousEnd: Date;

    switch (period) {
      case 'day':
        currentStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        );
        previousStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - 1,
        );
        previousEnd = new Date(currentStart.getTime() - 1);
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        currentStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - diffToMonday,
        );
        previousStart = new Date(
          currentStart.getFullYear(),
          currentStart.getMonth(),
          currentStart.getDate() - 7,
        );
        previousEnd = new Date(currentStart.getTime() - 1);
        break;
      case 'month':
      default:
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(
          now.getFullYear(),
          now.getMonth(),
          0,
          23,
          59,
          59,
        );
        break;
    }

    return { currentStart, previousStart, previousEnd };
  }

  private getPeriodLabel(period: 'day' | 'week' | 'month'): string {
    const labels: Record<string, string> = {
      day: 'Сегодня vs Вчера',
      week: 'Эта неделя vs Прошлая',
      month: 'Этот месяц vs Прошлый',
    };
    return labels[period];
  }
}
