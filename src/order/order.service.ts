import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { AddOrderItemDto } from './dto';
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
      this.logger.log(`Adding item to cart for user ${userId}, product ${dto.productId}`);

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
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error adding item to cart for user ${userId}: ${error.message}`, error.stack);
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
      this.logger.log(`Fetched ${cartItems.length} cart items for user ${userId}`);

      return cartItems;
    } catch (error) {
      this.logger.error(`Error fetching cart items for user ${userId}: ${error.message}`, error.stack);
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
        this.logger.warn(`Cart item ${orderItemId} not found for user ${userId}`);
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
      this.logger.error(`Error removing cart item ${orderItemId} for user ${userId}: ${error.message}`, error.stack);
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
      this.logger.log(`Cleared ${result.count} items from cart for user ${userId}`);

      return { message: 'Cart cleared successfully' };
    } catch (error) {
      this.logger.error(`Error clearing cart for user ${userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to clear cart');
    }
  }

  async checkout(userId: string) {
    try {
      this.logger.log(`Starting checkout for user ${userId}`);

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
          this.logger.warn(`Checkout attempted with empty cart for user ${userId}`);
          throw new BadRequestException('Cart is empty');
        }

        // Validate all products are still active
        const inactiveProducts = cartItems.filter(
          (item) => !item.product.isActive,
        );
        if (inactiveProducts.length > 0) {
          this.logger.warn(`Checkout blocked: ${inactiveProducts.length} inactive products for user ${userId}`);
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
              this.logger.debug(`Price updated for item ${item.id}: ${item.price} -> ${calculatedPrice}`);
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

        this.logger.log(`Created order ${newOrder.id} with total ${total} for user ${userId}`);

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

      this.logger.log(`Checkout completed successfully for user ${userId}, order ${order?.id}`);
      return order;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error during checkout for user ${userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to complete checkout');
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
      this.logger.error(`Error fetching orders for user ${userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch orders');
    }
  }

  async getOrderById(userId: string, orderId: string) {
    try {
      this.logger.log(`Fetching order ${orderId} for user ${userId}`);

      // Try to get from cache first
      const cached = await this.cacheService.getCachedOrder(userId, orderId);
      if (cached) {
        this.logger.debug(`Returning cached order ${orderId} for user ${userId}`);
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
      this.logger.error(`Error fetching order ${orderId} for user ${userId}: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch order');
    }
  }
}
