import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { GuestCacheService } from './cache.service';
import {
  FinalizeOrderDto,
  ApplyCouponDto,
  SelectPickupDto,
} from '../../order/dto';

@Injectable()
export class GuestOrderService {
  private readonly logger = new Logger(GuestOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: GuestCacheService,
  ) {}

  /**
   * Initialize order for guest user - Convert cart items to a pending order
   */
  async initOrder(sessionId: string) {
    try {
      this.logger.log(`Initializing order for guest session ${sessionId}`);

      const order = await this.prisma.$transaction(async (tx) => {
        // Get all cart items for the session (items not yet in an order)
        const cartItems = await tx.orderItem.findMany({
          where: {
            sessionId,
            orderId: null,
          },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
                isActive: true,
              },
            },
          },
        });

        // Check if cart is empty
        if (cartItems.length === 0) {
          this.logger.warn(
            `Checkout attempted with empty cart for session ${sessionId}`,
          );
          throw new HttpException('Cart is empty', HttpStatus.BAD_REQUEST);
        }

        // Validate all products are still active
        const inactiveProducts = cartItems.filter(
          (item) => !item.product.isActive,
        );
        if (inactiveProducts.length > 0) {
          this.logger.warn(
            `Checkout blocked: ${inactiveProducts.length} inactive products for session ${sessionId}`,
          );
          throw new HttpException(
            {
              inactiveProducts: inactiveProducts,
              message: 'Remove these products to checkout the order',
            },
            HttpStatus.BAD_REQUEST,
          );
        }

        // Recalculate prices based on current product prices
        const updatedItems = await Promise.all(
          cartItems.map(async (item) => {
            const currentPrice = item.product.price;
            const calculatedPrice = currentPrice.toNumber() * item.quantity;

            // Update item price if it changed
            if (item.price.toNumber() !== calculatedPrice) {
              this.logger.debug(
                `Price updated for item ${item.id}: ${item.price} -> ${calculatedPrice}`,
              );
              return tx.orderItem.update({
                where: { id: item.id },
                data: { price: calculatedPrice },
                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      slug: true,
                    },
                  },
                },
              });
            }

            return {
              ...item,
              product: {
                id: item.product.id,
                name: item.product.name,
                slug: item.product.slug,
              },
            };
          }),
        );

        // Calculate total order price
        const total = updatedItems.reduce((sum, item) => {
          const price = item.price ? item.price.toNumber() : Number(item.price);
          return sum + price;
        }, 0);

        // Create the order with finalTotal equal to total (no discount yet)
        const newOrder = await tx.order.create({
          data: {
            sessionId,
            total,
            discount: 0,
            finalTotal: total,
            status: 'PENDING',
            deliveryMethod: 'PICKUP',
          },
        });

        this.logger.log(
          `Created order ${newOrder.id} with total ${total} for session ${sessionId}`,
        );

        // Link all cart items to the order
        await tx.orderItem.updateMany({
          where: {
            sessionId,
            orderId: null,
          },
          data: {
            orderId: newOrder.id,
          },
        });

        // Fetch the complete order with items
        const completeOrder = await tx.order.findUnique({
          where: { id: newOrder.id },
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
          },
        });

        return completeOrder;
      });

      // Invalidate cart and orders cache (outside transaction)
      await this.cacheService.invalidateCart(sessionId);
      await this.cacheService.invalidateGuestOrders(sessionId);

      this.logger.log(
        `Order initialized successfully for session ${sessionId}, order ${order?.id}`,
      );
      return order;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error during order initialization for session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to initialize order');
    }
  }

  /**
   * Get all orders for a guest session
   */
  async getGuestOrders(sessionId: string) {
    try {
      this.logger.log(`Fetching orders for session ${sessionId}`);

      // Try to get from cache first
      const cached = await this.cacheService.getCachedGuestOrders(sessionId);
      if (cached) {
        this.logger.debug(`Returning cached orders for session ${sessionId}`);
        return cached;
      }

      const orders = await this.prisma.order.findMany({
        where: { sessionId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: {
                    take: 1,
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Cache the result
      await this.cacheService.cacheGuestOrders(sessionId, orders);
      this.logger.log(
        `Fetched ${orders.length} orders for session ${sessionId}`,
      );

      return orders;
    } catch (error) {
      this.logger.error(
        `Error fetching orders for session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch orders');
    }
  }

  /**
   * Get a specific order by ID for a guest session
   */
  async getOrderById(sessionId: string, orderId: number) {
    try {
      this.logger.log(`Fetching order ${orderId} for session ${sessionId}`);

      // Try to get from cache first
      const cached = await this.cacheService.getCachedGuestOrder(
        sessionId,
        orderId,
      );
      if (cached) {
        this.logger.debug(
          `Returning cached order ${orderId} for session ${sessionId}`,
        );
        return cached;
      }

      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          sessionId,
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  images: {
                    take: 1,
                    orderBy: { sortOrder: 'asc' },
                  },
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

      if (!order) {
        this.logger.warn(`Order ${orderId} not found for session ${sessionId}`);
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      // Cache the result
      await this.cacheService.cacheGuestOrder(sessionId, orderId, order);
      this.logger.log(`Fetched order ${orderId} for session ${sessionId}`);

      return order;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error fetching order ${orderId} for session ${sessionId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch order');
    }
  }

  /**
   * Select pickup point and window for a guest order
   */
  async selectPickup(sessionId: string, orderId: number, dto: SelectPickupDto) {
    try {
      this.logger.log(
        `Selecting pickup for order ${orderId}, point ${dto.pointId}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to session
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            sessionId,
          },
        });

        if (!order) {
          this.logger.warn(
            `Order ${orderId} not found for session ${sessionId}`,
          );
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        if (order.status !== 'PENDING') {
          this.logger.warn(
            `Order ${orderId} is not in PENDING status: ${order.status}`,
          );
          throw new HttpException(
            'Order is not in a state that allows pickup selection',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 2. Verify pickup point exists and is active
        const pickupPoint = await tx.pickupPoint.findUnique({
          where: { id: dto.pointId },
        });

        if (!pickupPoint) {
          this.logger.warn(`Pickup point ${dto.pointId} not found`);
          throw new HttpException(
            'Pickup point not found',
            HttpStatus.NOT_FOUND,
          );
        }

        if (!pickupPoint.isActive) {
          this.logger.warn(`Pickup point ${dto.pointId} is not active`);
          throw new HttpException(
            'Pickup point is not available',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 3. Calculate the pickup window based on the requested time
        const { windowStart, windowEnd } = this.calculatePickupWindow(
          dto.pickupTime,
        );

        // 4. Find or create the pickup window
        let pickupWindow = await tx.pickupWindow.findUnique({
          where: {
            pointId_startTime: {
              pointId: dto.pointId,
              startTime: windowStart,
            },
          },
        });

        if (pickupWindow) {
          // Check if capacity is available
          if (pickupWindow.capacity <= 0) {
            this.logger.warn(
              `Pickup window ${pickupWindow.id} is full for point ${dto.pointId}`,
            );
            throw new HttpException(
              'This pickup window is fully booked. Please select a different time.',
              HttpStatus.CONFLICT,
            );
          }

          // Update existing window: decrease capacity, increase reserved
          pickupWindow = await tx.pickupWindow.update({
            where: { id: pickupWindow.id },
            data: {
              capacity: { decrement: 1 },
              reserved: { increment: 1 },
            },
          });

          this.logger.log(
            `Reserved slot in existing window ${pickupWindow.id}. Remaining capacity: ${pickupWindow.capacity}`,
          );
        } else {
          // Create new window with capacity = 23 (24 - 1), reserved = 1
          pickupWindow = await tx.pickupWindow.create({
            data: {
              pointId: dto.pointId,
              startTime: windowStart,
              endTime: windowEnd,
              capacity: 23,
              reserved: 1,
            },
          });

          this.logger.log(
            `Created new pickup window ${pickupWindow.id} for point ${dto.pointId}`,
          );
        }

        // 5. If order already had a window, release the old slot
        if (order.windowId) {
          await tx.pickupWindow.update({
            where: { id: order.windowId },
            data: {
              capacity: { increment: 1 },
              reserved: { decrement: 1 },
            },
          });
          this.logger.log(
            `Released slot from previous window ${order.windowId}`,
          );
        }

        // 6. Update the order with pickup point and window
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            pointId: dto.pointId,
            windowId: pickupWindow.id,
          },
          include: {
            pickupPoint: {
              select: {
                id: true,
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
          },
        });

        return updatedOrder;
      });

      // Invalidate orders cache
      await this.cacheService.invalidateGuestOrders(sessionId);
      await this.cacheService.invalidateGuestOrder(sessionId, orderId);

      this.logger.log(
        `Pickup selected successfully for order ${orderId}. Window: ${result.pickupWindow?.startTime} - ${result.pickupWindow?.endTime}`,
      );

      return {
        ...result,
        message: 'Pickup point and window selected successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error selecting pickup for order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to select pickup');
    }
  }

  /**
   * Finalize a guest order with delivery details
   */
  async finalizeOrder(
    sessionId: string,
    orderId: number,
    dto: FinalizeOrderDto,
  ) {
    try {
      this.logger.log(
        `Finalizing order ${orderId} for session ${sessionId} with delivery method ${dto.deliveryMethod}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to session
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            sessionId,
          },
        });

        if (!order) {
          this.logger.warn(
            `Order ${orderId} not found for session ${sessionId}`,
          );
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        if (order.status !== 'PENDING') {
          this.logger.warn(
            `Order ${orderId} is not in PENDING status: ${order.status}`,
          );
          throw new HttpException(
            'Order is not in a state that allows finalization',
            HttpStatus.BAD_REQUEST,
          );
        }

        // Validate payLater can only be used with CASH payment method
        if (dto.payLater && dto.paymentMethod !== 'CASH') {
          throw new HttpException(
            'Pay later option is only available with CASH payment method',
            HttpStatus.BAD_REQUEST,
          );
        }

        // Prepare common update data
        const updateData: any = {
          deliveryMethod: dto.deliveryMethod,
          paymentMethod: dto.paymentMethod,
          buyer: dto.buyer,
          email: dto.email,
          phone: dto.phone,
          payLater: dto.payLater ?? false,
        };

        let pickupWindow = null;
        let pickupPoint = null;

        if (dto.deliveryMethod === 'PICKUP') {
          // Validate PICKUP specific fields
          if (!dto.pointId || !dto.pickupTime) {
            throw new HttpException(
              'Pickup point ID and pickup time are required for pickup delivery',
              HttpStatus.BAD_REQUEST,
            );
          }

          // 2. Verify pickup point exists and is active
          pickupPoint = await tx.pickupPoint.findUnique({
            where: { id: dto.pointId },
          });

          if (!pickupPoint) {
            this.logger.warn(`Pickup point ${dto.pointId} not found`);
            throw new HttpException(
              'Pickup point not found',
              HttpStatus.NOT_FOUND,
            );
          }

          if (!pickupPoint.isActive) {
            this.logger.warn(`Pickup point ${dto.pointId} is not active`);
            throw new HttpException(
              'Pickup point is not available',
              HttpStatus.BAD_REQUEST,
            );
          }

          // 3. Calculate the pickup window based on the requested time
          const { windowStart, windowEnd } = this.calculatePickupWindow(
            dto.pickupTime,
          );

          // 4. Find or create the pickup window
          pickupWindow = await tx.pickupWindow.findUnique({
            where: {
              pointId_startTime: {
                pointId: dto.pointId,
                startTime: windowStart,
              },
            },
          });

          if (pickupWindow) {
            // Check if capacity is available
            if (pickupWindow.capacity <= 0) {
              this.logger.warn(
                `Pickup window ${pickupWindow.id} is full for point ${dto.pointId}`,
              );
              throw new HttpException(
                'This pickup window is fully booked. Please select a different time.',
                HttpStatus.CONFLICT,
              );
            }

            // Update existing window: decrease capacity, increase reserved
            pickupWindow = await tx.pickupWindow.update({
              where: { id: pickupWindow.id },
              data: {
                capacity: { decrement: 1 },
                reserved: { increment: 1 },
              },
            });

            this.logger.log(
              `Reserved slot in existing window ${pickupWindow.id}. Remaining capacity: ${pickupWindow.capacity}`,
            );
          } else {
            // Create new window with capacity = 23 (24 - 1), reserved = 1
            pickupWindow = await tx.pickupWindow.create({
              data: {
                pointId: dto.pointId,
                startTime: windowStart,
                endTime: windowEnd,
                capacity: 23,
                reserved: 1,
              },
            });

            this.logger.log(
              `Created new pickup window ${pickupWindow.id} for point ${dto.pointId}`,
            );
          }

          // 5. If order already had a window, release the old slot
          if (order.windowId) {
            await tx.pickupWindow.update({
              where: { id: order.windowId },
              data: {
                capacity: { increment: 1 },
                reserved: { decrement: 1 },
              },
            });
            this.logger.log(
              `Released slot from previous window ${order.windowId}`,
            );
          }

          // Add pickup-specific update data
          updateData.pointId = dto.pointId;
          updateData.windowId = pickupWindow.id;
          updateData.address = null;
        } else {
          // DELIVERY
          if (!dto.address) {
            throw new HttpException(
              'Address is required for delivery',
              HttpStatus.BAD_REQUEST,
            );
          }

          // If order previously had a pickup window, release the slot
          if (order.windowId) {
            await tx.pickupWindow.update({
              where: { id: order.windowId },
              data: {
                capacity: { increment: 1 },
                reserved: { decrement: 1 },
              },
            });
            this.logger.log(
              `Released slot from previous window ${order.windowId}`,
            );
          }

          // Add delivery-specific update data
          updateData.address = dto.address;
          updateData.pointId = null;
          updateData.windowId = null;
        }

        // 6. Update the order
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: updateData,
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    images: {
                      take: 1,
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
            },
            pickupPoint:
              dto.deliveryMethod === 'PICKUP'
                ? {
                    select: {
                      id: true,
                      name: true,
                      address: true,
                    },
                  }
                : false,
            pickupWindow:
              dto.deliveryMethod === 'PICKUP'
                ? {
                    select: {
                      id: true,
                      startTime: true,
                      endTime: true,
                    },
                  }
                : false,
            coupon: true,
          },
        });

        return updatedOrder;
      });

      // Invalidate orders cache
      await this.cacheService.invalidateGuestOrders(sessionId);
      await this.cacheService.invalidateGuestOrder(sessionId, orderId);

      this.logger.log(
        `Order ${orderId} finalized successfully with ${dto.deliveryMethod} delivery`,
      );

      return {
        ...result,
        message: 'Order finalized successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error finalizing order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to finalize order');
    }
  }

  /**
   * Calculate the pickup window start and end times
   */
  private calculatePickupWindow(pickupTimeStr: string): {
    windowStart: Date;
    windowEnd: Date;
  } {
    const pickupTime = new Date(pickupTimeStr);

    // Convert to Moscow time (UTC+3)
    const moscowOffset = 3 * 60;
    const utcTime =
      pickupTime.getTime() + pickupTime.getTimezoneOffset() * 60000;
    const moscowTime = new Date(utcTime + moscowOffset * 60000);

    const moscowHour = moscowTime.getUTCHours();

    // Validate pickup time is within allowed window (10:00 - 21:00 Moscow)
    if (moscowHour < 10 || moscowHour >= 21) {
      throw new HttpException(
        'Pickup time must be between 10:00 and 21:00 Moscow time',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Calculate window start (floor to the current hour in Moscow time)
    const windowStartMoscow = new Date(moscowTime);
    windowStartMoscow.setUTCMinutes(0, 0, 0);

    // Calculate window end (start + 1 hour)
    const windowEndMoscow = new Date(windowStartMoscow);
    windowEndMoscow.setUTCHours(windowEndMoscow.getUTCHours() + 1);

    // Convert back to UTC for storage
    const windowStart = new Date(
      windowStartMoscow.getTime() - moscowOffset * 60000,
    );
    const windowEnd = new Date(
      windowEndMoscow.getTime() - moscowOffset * 60000,
    );

    this.logger.debug(
      `Calculated window: ${windowStart.toISOString()} - ${windowEnd.toISOString()} for requested time ${pickupTimeStr}`,
    );

    return { windowStart, windowEnd };
  }

  /**
   * Apply a coupon to a guest order
   */
  async applyCoupon(sessionId: string, orderId: number, dto: ApplyCouponDto) {
    try {
      this.logger.log(
        `Applying coupon ${dto.code} to order ${orderId} for session ${sessionId}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to session
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            sessionId,
          },
          include: {
            coupon: true,
          },
        });

        if (!order) {
          this.logger.warn(
            `Order ${orderId} not found for session ${sessionId}`,
          );
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        // 2. Check if order is in a valid state for coupon application
        if (order.status !== 'PENDING') {
          this.logger.warn(
            `Order ${orderId} is not in PENDING status: ${order.status}`,
          );
          throw new HttpException(
            'Coupon can only be applied to pending orders',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 3. Check if order already has a coupon applied
        if (order.couponId) {
          this.logger.warn(
            `Order ${orderId} already has coupon ${order.couponId} applied`,
          );
          throw new HttpException(
            'Order already has a coupon applied. Remove it first to apply a new one.',
            HttpStatus.CONFLICT,
          );
        }

        // 4. Find and validate the coupon
        const normalizedCode = dto.code.toUpperCase().trim();
        const coupon = await tx.coupon.findUnique({
          where: { code: normalizedCode },
        });

        if (!coupon) {
          this.logger.warn(`Coupon ${normalizedCode} not found`);
          throw new HttpException('Coupon not found', HttpStatus.NOT_FOUND);
        }

        const now = new Date();

        if (!coupon.isActive) {
          throw new HttpException(
            'Coupon is not active',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (now < new Date(coupon.validFrom)) {
          throw new HttpException(
            'Coupon is not yet valid',
            HttpStatus.BAD_REQUEST,
          );
        }

        if (now > new Date(coupon.validTo)) {
          throw new HttpException('Coupon has expired', HttpStatus.BAD_REQUEST);
        }

        if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
          throw new HttpException(
            'Coupon usage limit reached',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 5. Calculate the discount
        const orderTotal = order.total.toNumber();
        let discount: number;

        if (coupon.type === 'PERCENTAGE') {
          discount = (orderTotal * coupon.value.toNumber()) / 100;
        } else {
          discount = coupon.value.toNumber();
        }

        // Ensure discount doesn't exceed order total
        discount = Math.min(discount, orderTotal);

        // Round to 2 decimal places
        discount = Math.round(discount * 100) / 100;

        const finalTotal = Math.round((orderTotal - discount) * 100) / 100;

        this.logger.log(
          `Calculated discount: ${discount}, final total: ${finalTotal} for order ${orderId}`,
        );

        // 6. Update the coupon usage count
        await tx.coupon.update({
          where: { id: coupon.id },
          data: {
            usageCount: { increment: 1 },
          },
        });

        // 7. Update the order with coupon and new totals
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            couponId: coupon.id,
            discount: discount,
            finalTotal: finalTotal,
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

        return updatedOrder;
      });

      // Invalidate caches
      await this.cacheService.invalidateGuestOrders(sessionId);
      await this.cacheService.invalidateGuestOrder(sessionId, orderId);

      this.logger.log(
        `Coupon ${dto.code} applied successfully to order ${orderId}. Discount: ${result.discount}`,
      );

      return {
        ...result,
        message: 'Coupon applied successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error applying coupon to order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to apply coupon');
    }
  }

  /**
   * Remove a coupon from a guest order
   */
  async removeCoupon(sessionId: string, orderId: number) {
    try {
      this.logger.log(
        `Removing coupon from order ${orderId} for session ${sessionId}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to session
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            sessionId,
          },
          include: {
            coupon: true,
          },
        });

        if (!order) {
          this.logger.warn(
            `Order ${orderId} not found for session ${sessionId}`,
          );
          throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
        }

        // 2. Check if order is in a valid state
        if (order.status !== 'PENDING') {
          this.logger.warn(
            `Order ${orderId} is not in PENDING status: ${order.status}`,
          );
          throw new HttpException(
            'Coupon can only be removed from pending orders',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 3. Check if order has a coupon to remove
        if (!order.couponId) {
          this.logger.warn(`Order ${orderId} does not have a coupon applied`);
          throw new HttpException(
            'Order does not have a coupon applied',
            HttpStatus.BAD_REQUEST,
          );
        }

        // 4. Decrement coupon usage count
        await tx.coupon.update({
          where: { id: order.couponId },
          data: {
            usageCount: { decrement: 1 },
          },
        });

        // 5. Update the order - remove coupon and restore original total
        const orderTotal = order.total.toNumber();
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            couponId: null,
            discount: 0,
            finalTotal: orderTotal,
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
          },
        });

        return updatedOrder;
      });

      // Invalidate caches
      await this.cacheService.invalidateGuestOrders(sessionId);
      await this.cacheService.invalidateGuestOrder(sessionId, orderId);

      this.logger.log(`Coupon removed successfully from order ${orderId}`);

      return {
        ...result,
        message: 'Coupon removed successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error removing coupon from order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to remove coupon');
    }
  }
}
