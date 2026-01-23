import {
  Injectable,
  InternalServerErrorException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import {
  AddOrderItemDto,
  SelectPickupDto,
  FinalizeOrderDto,
  ApplyCouponDto,
  UpdateOrderStatusDto,
  QuickBuyDto,
} from './dto';
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
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }

      if (!product.isActive) {
        this.logger.warn(`Product ${dto.productId} is not active`);
        throw new HttpException(
          'Product is not available',
          HttpStatus.BAD_REQUEST,
        );
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
      if (error instanceof HttpException) {
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
        throw new HttpException('Cart item not found', HttpStatus.NOT_FOUND);
      }

      await this.prisma.orderItem.delete({
        where: { id: orderItemId },
      });

      await this.cacheService.invalidateCart(userId);
      this.logger.log(`Removed cart item ${orderItemId} for user ${userId}`);

      return { message: 'Cart item removed successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
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
          throw new HttpException('Cart is empty', HttpStatus.BAD_REQUEST);
        }

        // Validate all products are still active
        const inactiveProducts = cartItems.filter(
          (item) => !item.product.isActive,
        );
        if (inactiveProducts.length > 0) {
          this.logger.warn(
            `Checkout blocked: ${inactiveProducts.length} inactive products for user ${userId}`,
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
            userId,
            total,
            discount: 0,
            finalTotal: total,
            status: 'PENDING',
            deliveryMethod: 'PICKUP',
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
      if (error instanceof HttpException) {
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

  async getOrderById(userId: string, orderId: number) {
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
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      // Cache the result
      await this.cacheService.cacheOrder(userId, orderId, order);
      this.logger.log(`Fetched order ${orderId} for user ${userId}`);

      return order;
    } catch (error) {
      if (error instanceof HttpException) {
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
  async selectPickup(userId: string, orderId: number, dto: SelectPickupDto) {
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
            // Status remains PENDING until payment is created
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
   * Finalize an order with delivery details.
   * For PICKUP: assigns pickup point and time window
   * For DELIVERY: assigns delivery address
   * Always requires: buyer info, email, phone
   */
  async finalizeOrder(userId: string, orderId: number, dto: FinalizeOrderDto) {
    try {
      this.logger.log(
        `Finalizing order ${orderId} for user ${userId} with delivery method ${dto.deliveryMethod}`,
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
          status: 'PROCESSING',
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
            this.logger.log(
              `Released slot from previous window ${order.windowId}`,
            );
          }

          // Add pickup-specific update data
          updateData.pointId = dto.pointId;
          updateData.windowId = pickupWindow.id;
          updateData.address = null; // Clear address for pickup
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
          updateData.pointId = null; // Clear pickup point for delivery
          updateData.windowId = null; // Clear pickup window for delivery
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
      await this.cacheService.invalidateUserOrders(userId);
      await this.cacheService.invalidateOrder(userId, orderId);

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
   * Apply a coupon to an order with price deduction.
   * Validates the coupon, calculates discount, and updates the order total.
   * All operations are wrapped in a transaction.
   */
  async applyCoupon(userId: string, orderId: number, dto: ApplyCouponDto) {
    try {
      this.logger.log(
        `Applying coupon ${dto.code} to order ${orderId} for user ${userId}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to user
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            userId,
          },
          include: {
            coupon: true,
          },
        });

        if (!order) {
          this.logger.warn(`Order ${orderId} not found for user ${userId}`);
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
          // Percentage discount
          discount = (orderTotal * coupon.value.toNumber()) / 100;
        } else {
          // Fixed discount
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
      await this.cacheService.invalidateUserOrders(userId);
      await this.cacheService.invalidateOrder(userId, orderId);

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
   * Remove a coupon from an order and restore the original total.
   * All operations are wrapped in a transaction.
   */
  async removeCoupon(userId: string, orderId: number) {
    try {
      this.logger.log(
        `Removing coupon from order ${orderId} for user ${userId}`,
      );

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to user
        const order = await tx.order.findFirst({
          where: {
            id: orderId,
            userId,
          },
          include: {
            coupon: true,
          },
        });

        if (!order) {
          this.logger.warn(`Order ${orderId} not found for user ${userId}`);
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

        // 3. Check if order has a coupon
        if (!order.couponId) {
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

        // 5. Update order to remove coupon and restore original total
        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: {
            couponId: null,
            discount: 0,
            finalTotal: order.total,
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
      await this.cacheService.invalidateUserOrders(userId);
      await this.cacheService.invalidateOrder(userId, orderId);

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

  // Admin methods
  async getAllOrders(filters: {
    page: number;
    limit: number;
    status?: string;
    userId?: string;
  }) {
    try {
      const { page, limit, status, userId } = filters;
      const skip = (page - 1) * limit;

      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (userId) {
        where.userId = userId;
      }

      const [orders, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    images: true,
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
            coupon: {
              select: {
                id: true,
                code: true,
                type: true,
                value: true,
              },
            },
          },
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        data: orders,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting all orders: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to get orders');
    }
  }

  async getOrderByIdAdmin(orderId: number) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                  slug: true,
                  price: true,
                  oldPrice: true,
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
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      return order;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error getting order ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to get order');
    }
  }

  async updateOrderStatus(orderId: number, dto: UpdateOrderStatusDto) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
      }

      const updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: dto.status },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
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

      // Invalidate cache
      await this.cacheService.invalidateUserOrders(order.userId);
      await this.cacheService.invalidateOrder(order.userId, orderId);

      this.logger.log(`Order ${orderId} status updated to ${dto.status}`);

      return updatedOrder;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error updating order status ${orderId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to update order status');
    }
  }

  async getOrderStats() {
    try {
      const [
        totalOrders,
        pendingOrders,
        processingOrders,
        deliveredOrders,
        totalRevenue,
      ] = await Promise.all([
        this.prisma.order.count({}),
        this.prisma.order.count({
          where: { status: 'PENDING' },
        }),
        this.prisma.order.count({
          where: { status: 'PROCESSING' },
        }),
        this.prisma.order.count({
          where: { status: 'DELIVERED' },
        }),
        this.prisma.order.aggregate({
          where: { status: { in: ['DELIVERED', 'SHIPPED'] } },
          _sum: { finalTotal: true },
        }),
      ]);

      return {
        totalOrders,
        pendingOrders,
        processingOrders,
        deliveredOrders,
        totalRevenue: totalRevenue._sum.finalTotal || 0,
      };
    } catch (error) {
      this.logger.error(
        `Error getting order stats: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to get order stats');
    }
  }

  /**
   * Quick buy (1-click purchase)
   * Creates an order with a single product without requiring authentication
   * Customer info is stored in the order comment for manual processing
   */
  async quickBuy(dto: QuickBuyDto, userId?: string) {
    try {
      this.logger.log(
        `Quick buy initiated for product ${dto.productId}, customer: ${dto.name}`,
      );

      // Verify product exists and is active
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        select: {
          id: true,
          name: true,
          price: true,
          isActive: true,
          images: {
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!product) {
        this.logger.warn(`Product ${dto.productId} not found`);
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }

      if (!product.isActive) {
        this.logger.warn(`Product ${dto.productId} is not active`);
        throw new HttpException(
          'Product is not available',
          HttpStatus.BAD_REQUEST,
        );
      }

      const quantity = dto.quantity || 1;
      const itemPrice = product.price.toNumber() * quantity;

      // Create customer info comment
      const customerInfo = [
        `[QUICK BUY / КУПИТЬ В 1 КЛИК]`,
        `Имя: ${dto.name}`,
        `Телефон: ${dto.phone}`,
        dto.email ? `Email: ${dto.email}` : null,
        dto.comment ? `Комментарий: ${dto.comment}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      // Create order with item in a transaction
      // Note: Customer info is logged for manual processing
      this.logger.log(`Quick buy customer info:\n${customerInfo}`);

      const result = await this.prisma.$transaction(async (tx) => {
        // Create the order
        // If userId is provided (authenticated user), use it; otherwise use a guest placeholder
        const order = await tx.order.create({
          data: {
            userId: userId || 'guest-quick-buy',
            total: itemPrice,
            discount: 0,
            finalTotal: itemPrice,
            status: 'PENDING',
          },
        });

        // Create the order item
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            userId: userId || 'guest-quick-buy',
            productId: dto.productId,
            quantity,
            price: itemPrice,
          },
        });

        return order;
      });

      this.logger.log(
        `Quick buy order created successfully: ${result.id} for ${dto.name}`,
      );

      return {
        orderId: result.id,
        status: result.status,
        total: result.finalTotal,
        customer: {
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
        },
        product: {
          id: product.id,
          name: product.name,
          price: product.price.toNumber(),
          quantity,
          image: product.images[0]?.url || null,
        },
        message:
          'Заказ создан! Наш менеджер свяжется с вами для подтверждения.',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Error during quick buy for product ${dto.productId}: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to create quick buy order',
      );
    }
  }
}
