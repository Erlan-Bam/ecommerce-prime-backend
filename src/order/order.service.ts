import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { AddOrderItemDto, SelectPickupDto } from './dto';
import { OrderCacheService } from './services/cache.service';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: OrderCacheService,
  ) {}

  async addOrderItem(userId: string, dto: AddOrderItemDto) {
    try {
      this.logger.log(
        `Adding item to cart for user ${userId}, product ${dto.productId}`,
      );

      // Verify product exists and is active
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });

      if (!product) {
        this.logger.warn(`Product ${dto.productId} not found`);
        throw new NotFoundException('Product not found');
      }

      if (!product.isActive) {
        this.logger.warn(`Product ${dto.productId} is not active`);
        throw new BadRequestException('Product is not available');
      }

      // Check if item already exists in cart for this user
      const existingItem = await this.prisma.orderItem.findFirst({
        where: {
          userId,
          productId: dto.productId,
          orderId: null, // Only cart items (not yet in an order)
        },
      });

      if (existingItem) {
        // Update existing item quantity
        const newQuantity = existingItem.quantity + dto.quantity;
        const result = await this.prisma.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: newQuantity,
            price: product.price.toNumber() * newQuantity,
          },
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
        });

        await this.cacheService.invalidateCart(userId);
        this.logger.log(`Updated cart item quantity for user ${userId}`);
        return result;
      }

      const result = await this.prisma.orderItem.create({
        data: {
          userId,
          productId: dto.productId,
          quantity: dto.quantity,
          price: product.price.toNumber() * dto.quantity,
        },
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
      });

      await this.cacheService.invalidateCart(userId);
      this.logger.log(`Added new item to cart for user ${userId}`);
      return result;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Error adding item to cart for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to add item to cart');
    }
  }

  async getCartItems(userId: string) {
    try {
      this.logger.log(`Fetching cart items for user ${userId}`);

      // Try to get from cache first
      const cached = await this.cacheService.getCachedCart(userId);
      if (cached) {
        this.logger.debug(`Returning cached cart for user ${userId}`);
        return cached;
      }

      const cartItems = await this.prisma.orderItem.findMany({
        where: {
          userId,
          orderId: null, // Only items not yet in an order (cart items)
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              isActive: true,
              images: {
                take: 1,
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Cache the result
      await this.cacheService.cacheCart(userId, cartItems);
      this.logger.log(
        `Fetched ${cartItems.length} cart items for user ${userId}`,
      );

      return cartItems;
    } catch (error) {
      this.logger.error(
        `Error fetching cart items for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch cart items');
    }
  }

  async removeOrderItem(
    userId: string,
    orderItemId: string,
  ): Promise<{ message: string }> {
    try {
      this.logger.log(`Removing cart item ${orderItemId} for user ${userId}`);

      const orderItem = await this.prisma.orderItem.findFirst({
        where: {
          id: orderItemId,
          userId,
          orderId: null, // Can only remove cart items
        },
      });

      if (!orderItem) {
        this.logger.warn(
          `Cart item ${orderItemId} not found for user ${userId}`,
        );
        throw new NotFoundException('Cart item not found');
      }

      await this.prisma.orderItem.delete({
        where: { id: orderItemId },
      });

      await this.cacheService.invalidateCart(userId);
      this.logger.log(`Removed cart item ${orderItemId} for user ${userId}`);

      return { message: 'Cart item removed successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error removing cart item ${orderItemId} for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to remove cart item');
    }
  }

  async clearCart(userId: string): Promise<{ message: string }> {
    try {
      this.logger.log(`Clearing cart for user ${userId}`);

      const result = await this.prisma.orderItem.deleteMany({
        where: {
          userId,
          orderId: null,
        },
      });

      await this.cacheService.invalidateCart(userId);
      this.logger.log(
        `Cleared ${result.count} items from cart for user ${userId}`,
      );

      return { message: 'Cart cleared successfully' };
    } catch (error) {
      this.logger.error(
        `Error clearing cart for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to clear cart');
    }
  }

  async initOrder(userId: string) {
    try {
      this.logger.log(`Initializing order for user ${userId}`);

      const order = await this.prisma.$transaction(async (tx) => {
        // Get all cart items for the user (items not yet in an order)
        const cartItems = await tx.orderItem.findMany({
          where: {
            userId,
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
            `Checkout attempted with empty cart for user ${userId}`,
          );
          throw new BadRequestException('Cart is empty');
        }

        // Validate all products are still active
        const inactiveProducts = cartItems.filter(
          (item) => !item.product.isActive,
        );
        if (inactiveProducts.length > 0) {
          this.logger.warn(
            `Checkout blocked: ${inactiveProducts.length} inactive products for user ${userId}`,
          );
          throw new BadRequestException({
            inactiveProducts: inactiveProducts,
            message: 'Remove these products to checkout the order',
          });
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

        // Create the order
        const newOrder = await tx.order.create({
          data: {
            userId,
            total,
            status: 'PENDING',
          },
        });

        this.logger.log(
          `Created order ${newOrder.id} with total ${total} for user ${userId}`,
        );

        // Link all cart items to the order
        await tx.orderItem.updateMany({
          where: {
            userId,
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
      await this.cacheService.invalidateCart(userId);
      await this.cacheService.invalidateUserOrders(userId);

      this.logger.log(
        `Order initialized successfully for user ${userId}, order ${order?.id}`,
      );
      return order;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Error during order initialization for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to initialize order');
    }
  }

  async getUserOrders(userId: string) {
    try {
      this.logger.log(`Fetching orders for user ${userId}`);

      // Try to get from cache first
      const cached = await this.cacheService.getCachedUserOrders(userId);
      if (cached) {
        this.logger.debug(`Returning cached orders for user ${userId}`);
        return cached;
      }

      const orders = await this.prisma.order.findMany({
        where: { userId },
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
      await this.cacheService.cacheUserOrders(userId, orders);
      this.logger.log(`Fetched ${orders.length} orders for user ${userId}`);

      return orders;
    } catch (error) {
      this.logger.error(
        `Error fetching orders for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch orders');
    }
  }

  async getOrderById(userId: string, orderId: string) {
    try {
      this.logger.log(`Fetching order ${orderId} for user ${userId}`);

      // Try to get from cache first
      const cached = await this.cacheService.getCachedOrder(userId, orderId);
      if (cached) {
        this.logger.debug(
          `Returning cached order ${orderId} for user ${userId}`,
        );
        return cached;
      }

      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          userId,
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
        },
      });

      if (!order) {
        this.logger.warn(`Order ${orderId} not found for user ${userId}`);
        throw new NotFoundException('Order not found');
      }

      // Cache the result
      await this.cacheService.cacheOrder(userId, orderId, order);
      this.logger.log(`Fetched order ${orderId} for user ${userId}`);

      return order;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Error fetching order ${orderId} for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch order');
    }
  }

  /**
   * Select pickup point and window for an order.
   * Pickup windows are hourly slots from 10:00 to 21:00 Moscow time.
   * Each window has a capacity of 24 orders.
   */
  async selectPickup(userId: string, orderId: string, dto: SelectPickupDto) {
    try {
      this.logger.log(
        `Selecting pickup for order ${orderId}, point ${dto.pointId}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to user
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            userId,
          },
        });

        if (!order) {
          this.logger.warn(`Order ${orderId} not found for user ${userId}`);
          throw new NotFoundException('Order not found');
        }

        if (order.status !== 'PENDING') {
          this.logger.warn(
            `Order ${orderId} is not in PENDING status: ${order.status}`,
          );
          throw new BadRequestException(
            'Order is not in a state that allows pickup selection',
          );
        }

        // 2. Verify pickup point exists and is active
        const pickupPoint = await tx.pickupPoint.findUnique({
          where: { id: dto.pointId },
        });

        if (!pickupPoint) {
          this.logger.warn(`Pickup point ${dto.pointId} not found`);
          throw new NotFoundException('Pickup point not found');
        }

        if (!pickupPoint.isActive) {
          this.logger.warn(`Pickup point ${dto.pointId} is not active`);
          throw new BadRequestException('Pickup point is not available');
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
            throw new ConflictException(
              'This pickup window is fully booked. Please select a different time.',
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
              capacity: 23, // 24 - 1 for this reservation
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
          this.logger.log(`Released slot from previous window ${order.windowId}`);
        }

        // 6. Update the order with pickup point and window
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            pointId: dto.pointId,
            windowId: pickupWindow.id,
            status: 'PROCESSING', // Move to processing after pickup selection
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
      await this.cacheService.invalidateUserOrders(userId);
      await this.cacheService.invalidateOrder(userId, orderId);

      this.logger.log(
        `Pickup selected successfully for order ${orderId}. Window: ${result.pickupWindow?.startTime} - ${result.pickupWindow?.endTime}`,
      );

      return {
        ...result,
        message: 'Pickup point and window selected successfully',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
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
   * Calculate the pickup window start and end times based on the requested pickup time.
   * Windows are hourly from 10:00 to 21:00 Moscow time (UTC+3).
   * @param pickupTimeStr - ISO date string of requested pickup time
   * @returns Object with windowStart and windowEnd as Date objects
   */
  private calculatePickupWindow(pickupTimeStr: string): {
    windowStart: Date;
    windowEnd: Date;
  } {
    const pickupTime = new Date(pickupTimeStr);

    // Convert to Moscow time (UTC+3)
    const moscowOffset = 3 * 60; // +3 hours in minutes
    const utcTime = pickupTime.getTime() + pickupTime.getTimezoneOffset() * 60000;
    const moscowTime = new Date(utcTime + moscowOffset * 60000);

    const moscowHour = moscowTime.getUTCHours();

    // Validate pickup time is within allowed window (10:00 - 21:00 Moscow)
    if (moscowHour < 10 || moscowHour >= 21) {
      throw new BadRequestException(
        'Pickup time must be between 10:00 and 21:00 Moscow time',
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
    const windowEnd = new Date(windowEndMoscow.getTime() - moscowOffset * 60000);

    this.logger.debug(
      `Calculated window: ${windowStart.toISOString()} - ${windowEnd.toISOString()} for requested time ${pickupTimeStr}`,
    );

    return { windowStart, windowEnd };
  }
}
