import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { AddOrderItemDto } from './dto';
import { OrderCacheService } from './services/cache.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: OrderCacheService,
  ) {}

  async addOrderItem(userId: string, dto: AddOrderItemDto) {
    // Verify product exists and is active
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
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
    return result;
  }

  async getCartItems(userId: string) {
    // Try to get from cache first
    const cached = await this.cacheService.getCachedCart(userId);
    if (cached) {
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

    return cartItems;
  }

  async removeOrderItem(
    userId: string,
    orderItemId: string,
  ): Promise<{ message: string }> {
    const orderItem = await this.prisma.orderItem.findFirst({
      where: {
        id: orderItemId,
        userId,
        orderId: null, // Can only remove cart items
      },
    });

    if (!orderItem) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.orderItem.delete({
      where: { id: orderItemId },
    });

    await this.cacheService.invalidateCart(userId);

    return { message: 'Cart item removed successfully' };
  }

  async clearCart(userId: string): Promise<{ message: string }> {
    await this.prisma.orderItem.deleteMany({
      where: {
        userId,
        orderId: null,
      },
    });

    await this.cacheService.invalidateCart(userId);

    return { message: 'Cart cleared successfully' };
  }

  async checkout(userId: string) {
    return await this.prisma.$transaction(async (tx) => {
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
        throw new BadRequestException('Cart is empty');
      }

      // Validate all products are still active
      const inactiveProducts = cartItems.filter(
        (item) => !item.product.isActive,
      );
      if (inactiveProducts.length > 0) {
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
      const order = await tx.order.create({
        data: {
          userId,
          total,
          status: 'PENDING',
        },
      });

      // Link all cart items to the order
      await tx.orderItem.updateMany({
        where: {
          userId,
          orderId: null,
        },
        data: {
          orderId: order.id,
        },
      });

      // Fetch the complete order with items
      const completeOrder = await tx.order.findUnique({
        where: { id: order.id },
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

      // Invalidate cart and orders cache
      await this.cacheService.invalidateCart(userId);
      await this.cacheService.invalidateUserOrders(userId);

      return completeOrder;
    });
  }

  async getUserOrders(userId: string) {
    // Try to get from cache first
    const cached = await this.cacheService.getCachedUserOrders(userId);
    if (cached) {
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

    return orders;
  }

  async getOrderById(userId: string, orderId: string) {
    // Try to get from cache first
    const cached = await this.cacheService.getCachedOrder(userId, orderId);
    if (cached) {
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
      throw new NotFoundException('Order not found');
    }

    // Cache the result
    await this.cacheService.cacheOrder(userId, orderId, order);

    return order;
  }
}
