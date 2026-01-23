import {
  Injectable,
  InternalServerErrorException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { CreatePaymentDto, UpdatePaymentStatusDto } from './dto';
import { PaymentCacheService } from './services/cache.service';
import { OrderCacheService } from '../order/services/cache.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: PaymentCacheService,
    private readonly orderCacheService: OrderCacheService,
  ) {}

  /**
   * Create a payment for an order with selected payment method.
   * This will set the order status to PROCESSING.
   * Requires pickup point and window to be selected first.
   */
  async createPayment(userId: string, dto: CreatePaymentDto) {
    const { orderId } = dto;
    try {
      this.logger.log(
        `Creating payment for order ${orderId} with method ${dto.paymentMethod}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to user
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            userId,
          },
          include: {
            payment: true,
          },
        });

        if (!order) {
          this.logger.warn(`Order ${orderId} not found for user ${userId}`);
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        // 2. Check if order is in PENDING status
        if (order.status !== 'PENDING') {
          this.logger.warn(
            `Order ${orderId} is not in PENDING status: ${order.status}`,
          );
          throw new HttpException(
            'Payment can only be created for pending orders',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 3. Check if pickup point and window are selected
        if (!order.pointId || !order.windowId) {
          this.logger.warn(
            `Order ${orderId} does not have pickup point and window selected`,
          );
          throw new HttpException(
            'Please select pickup point and time window before creating payment',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 4. Check if payment already exists
        if (order.payment) {
          this.logger.warn(`Order ${orderId} already has a payment`);
          throw new HttpException(
            'Order already has a payment',
            HttpStatus.CONFLICT,
          );
        }

        // 5. Create the payment
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: order.finalTotal,
            method: dto.paymentMethod,
            status: 'PENDING',
          },
        });

        // 6. Update order status to PROCESSING
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            status: 'PROCESSING',
          },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                  },
                },
              },
            },
            pickupPoint: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
            pickupWindow: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
              },
            },
            payment: true,
            coupon: {
              select: {
                id: true,
                code: true,
                type: true,
                value: true,
              },
            },
          },
        });

        return { order: updatedOrder, payment };
      });

      // Invalidate caches
      await this.invalidatePaymentRelatedCaches(
        result.payment.id,
        orderId,
        userId,
      );

      this.logger.log(
        `Payment created successfully for order ${orderId}. Order status changed to PROCESSING.`,
      );

      return {
        ...result.order,
        message: 'Payment created successfully. Order is now processing.',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error creating payment for order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to create payment');
    }
  }

  /**
   * Get payment by order ID for a user
   */
  async getPaymentByOrderId(userId: string, orderId: number) {
    try {
      this.logger.log(`Fetching payment for order ${orderId}`);

      // Try cache first
      const cached = await this.cacheService.getCachedOrderPayment(orderId);
      if (cached) {
        this.logger.debug(`Returning cached payment for order ${orderId}`);
        return cached;
      }

      // Verify order belongs to user
      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          userId,
        },
        include: {
          payment: true,
        },
      });

      if (!order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      if (!order.payment) {
        throw new HttpException(
          'Payment not found for this order',
          HttpStatus.NOT_FOUND,
        );
      }

      // Cache the payment
      await this.cacheService.cacheOrderPayment(orderId, order.payment);

      return order.payment;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error fetching payment for order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch payment');
    }
  }

  /**
   * Get all payments for a user
   */
  async getUserPayments(userId: string) {
    try {
      this.logger.log(`Fetching payments for user ${userId}`);

      // Try cache first
      const cached = await this.cacheService.getCachedUserPayments(userId);
      if (cached) {
        this.logger.debug(`Returning cached payments for user ${userId}`);
        return cached;
      }

      const payments = await this.prisma.payment.findMany({
        where: {
          order: {
            userId,
          },
        },
        include: {
          order: {
            select: {
              id: true,
              total: true,
              finalTotal: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Cache the result
      await this.cacheService.cacheUserPayments(userId, payments);

      this.logger.log(`Fetched ${payments.length} payments for user ${userId}`);
      return payments;
    } catch (error) {
      this.logger.error(
        `Error fetching payments for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch payments');
    }
  }

  // =====================
  // Admin Methods
  // =====================

  /**
   * Admin: Get all payments with filters
   */
  async getAllPayments(filters: {
    page: number;
    limit: number;
    status?: string;
    method?: string;
  }) {
    try {
      const { page, limit, status, method } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (method) {
        where.method = method;
      }

      const [payments, total] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            order: {
              select: {
                id: true,
                total: true,
                finalTotal: true,
                status: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.payment.count({ where }),
      ]);

      return {
        data: payments,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting all payments: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to get payments');
    }
  }

  /**
   * Admin: Get payment by ID
   */
  async getPaymentById(paymentId: string) {
    try {
      this.logger.log(`Admin fetching payment ${paymentId}`);

      // Try cache first
      const cached = await this.cacheService.getCachedPayment(paymentId);
      if (cached) {
        this.logger.debug(`Returning cached payment ${paymentId}`);
        return cached;
      }

      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            select: {
              id: true,
              total: true,
              finalTotal: true,
              discount: true,
              status: true,
              userId: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              },
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                      price: true,
                    },
                  },
                },
              },
              pickupPoint: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
      }

      // Cache the payment
      await this.cacheService.cachePayment(paymentId, payment);

      return payment;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error fetching payment ${paymentId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch payment');
    }
  }

  /**
   * Admin: Update payment status.
   * When payment status is set to COMPLETED, order status is set to PAYED.
   * Only CASH payments can be manually marked as COMPLETED.
   */
  async updatePaymentStatus(orderId: number, dto: UpdatePaymentStatusDto) {
    try {
      this.logger.log(
        `Admin updating payment status for order ${orderId} to ${dto.status}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Find the order with payment
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            payment: true,
          },
        });

        if (!order) {
          this.logger.warn(`Order ${orderId} not found`);
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        if (!order.payment) {
          this.logger.warn(`Order ${orderId} does not have a payment`);
          throw new HttpException(
            'Order does not have a payment',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 2. For CASH payments, admin can mark as COMPLETED
        if (dto.status === 'COMPLETED' && order.payment.method !== 'CASH') {
          this.logger.warn(
            `Cannot manually complete non-cash payment for order ${orderId}`,
          );
          throw new HttpException(
            'Only cash payments can be manually marked as completed',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 3. Update the payment status
        const updatedPayment = await tx.payment.update({
          where: { id: order.payment.id },
          data: {
            status: dto.status,
          },
        });

        // 4. If payment is COMPLETED, update order status to PAYED
        let updatedOrder = order;
        if (dto.status === 'COMPLETED') {
          updatedOrder = await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'PAYED',
            },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              },
              pickupPoint: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
              payment: true,
              coupon: {
                select: {
                  id: true,
                  code: true,
                  type: true,
                  value: true,
                },
              },
            },
          });
        } else {
          // Just fetch the updated order
          updatedOrder = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              items: {
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              },
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                },
              },
              pickupPoint: {
                select: {
                  id: true,
                  name: true,
                  address: true,
                },
              },
              payment: true,
              coupon: {
                select: {
                  id: true,
                  code: true,
                  type: true,
                  value: true,
                },
              },
            },
          });
        }

        return { order: updatedOrder, payment: updatedPayment };
      });

      // Invalidate caches
      await this.invalidatePaymentRelatedCaches(
        result.payment.id,
        orderId,
        result.order.userId,
      );

      this.logger.log(
        `Payment status updated to ${dto.status} for order ${orderId}`,
      );

      return {
        ...result.order,
        message: `Payment status updated to ${dto.status}${dto.status === 'COMPLETED' ? '. Order is now PAYED.' : ''}`,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error updating payment status for order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update payment status');
    }
  }

  /**
   * Admin: Get payment statistics
   */
  async getPaymentStats() {
    try {
      const [
        totalPayments,
        pendingPayments,
        completedPayments,
        refundedPayments,
        cashPayments,
        robokassaPayments,
        totalRevenue,
      ] = await Promise.all([
        this.prisma.payment.count(),
        this.prisma.payment.count({ where: { status: 'PENDING' } }),
        this.prisma.payment.count({ where: { status: 'COMPLETED' } }),
        this.prisma.payment.count({ where: { status: 'REFUNDED' } }),
        this.prisma.payment.count({ where: { method: 'CASH' } }),
        this.prisma.payment.count({ where: { method: 'ROBOKASSA' } }),
        this.prisma.payment.aggregate({
          where: { status: 'COMPLETED' },
          _sum: { amount: true },
        }),
      ]);

      return {
        totalPayments,
        pendingPayments,
        completedPayments,
        refundedPayments,
        byMethod: {
          cash: cashPayments,
          robokassa: robokassaPayments,
        },
        totalRevenue: totalRevenue._sum.amount || 0,
      };
    } catch (error) {
      this.logger.error(
        `Error getting payment stats: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to get payment stats');
    }
  }

  /**
   * Helper method to invalidate all related caches
   */
  private async invalidatePaymentRelatedCaches(
    paymentId: string,
    orderId: number,
    userId: string,
  ): Promise<void> {
    await Promise.all([
      this.cacheService.invalidateAllRelated(paymentId, orderId, userId),
      this.orderCacheService.invalidateUserOrders(userId),
      this.orderCacheService.invalidateOrder(userId, orderId),
    ]);
  }
}
