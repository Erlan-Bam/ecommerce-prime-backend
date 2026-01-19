import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { GuestCacheService } from './cache.service';
import { AddGuestCartItemDto } from '../dto';

@Injectable()
export class GuestCartService {
  private readonly logger = new Logger(GuestCartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: GuestCacheService,
  ) {}

  async getCart(sessionId: string) {
    try {
      this.logger.log(`Getting cart for session: ${sessionId}`);

      // Try cache first
      const cached = await this.cacheService.getCachedCart(sessionId);
      if (cached) {
        this.logger.debug(`Returning cached cart for session: ${sessionId}`);
        return cached;
      }

      const cartItems = await this.prisma.orderItem.findMany({
        where: {
          sessionId,
          orderId: null, // Only cart items (not yet in an order)
        },
        include: {
          product: {
            include: {
              images: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
              categories: {
                include: {
                  category: { select: { id: true, title: true, slug: true } },
                },
                orderBy: { isPrimary: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const items = cartItems.map((item) => {
        const primaryCategory = item.product.categories[0]?.category;
        return {
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          product: {
            id: item.product.id,
            name: item.product.name,
            slug: item.product.slug,
            price: item.product.price,
            oldPrice: item.product.oldPrice,
            image: item.product.images[0]?.url || null,
            category: primaryCategory || null,
          },
          subtotal: Number(item.price),
        };
      });

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

      const result = {
        items,
        itemCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        total,
      };

      // Cache the result
      await this.cacheService.cacheCart(sessionId, result);

      return result;
    } catch (error) {
      this.logger.error(`Error getting cart: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to get cart',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async addItem(sessionId: string, dto: AddGuestCartItemDto) {
    try {
      this.logger.log(`Adding item to cart: ${dto.productId}`);

      // Verify product exists and is active
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
      });

      if (!product || !product.isActive) {
        throw new HttpException('Product not found', HttpStatus.NOT_FOUND);
      }

      // Check if item already exists in cart
      const existingItem = await this.prisma.orderItem.findFirst({
        where: {
          sessionId,
          productId: dto.productId,
          orderId: null,
        },
      });

      if (existingItem) {
        // Update quantity
        const newQuantity = existingItem.quantity + dto.quantity;
        const updatedItem = await this.prisma.orderItem.update({
          where: { id: existingItem.id },
          data: {
            quantity: newQuantity,
            price: product.price.toNumber() * newQuantity,
          },
          include: {
            product: {
              include: {
                images: { take: 1 },
              },
            },
          },
        });

        // Invalidate cache
        await this.cacheService.invalidateCart(sessionId);

        return {
          id: updatedItem.id,
          productId: updatedItem.productId,
          quantity: updatedItem.quantity,
          product: {
            id: updatedItem.product.id,
            name: updatedItem.product.name,
            price: updatedItem.product.price,
            image: updatedItem.product.images[0]?.url || null,
          },
        };
      }

      // Create new cart item
      const cartItem = await this.prisma.orderItem.create({
        data: {
          sessionId,
          productId: dto.productId,
          quantity: dto.quantity,
          price: product.price.toNumber() * dto.quantity,
        },
        include: {
          product: {
            include: {
              images: { take: 1 },
            },
          },
        },
      });

      // Update session last active time
      await this.prisma.guestSession.update({
        where: { id: sessionId },
        data: { lastActiveAt: new Date() },
      });

      // Invalidate cache
      await this.cacheService.invalidateCart(sessionId);

      return {
        id: cartItem.id,
        productId: cartItem.productId,
        quantity: cartItem.quantity,
        product: {
          id: cartItem.product.id,
          name: cartItem.product.name,
          price: cartItem.product.price,
          image: cartItem.product.images[0]?.url || null,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error adding item to cart: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to add item to cart',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateItem(sessionId: string, productId: string, quantity: number) {
    try {
      this.logger.log(
        `Updating cart item: ${productId}, quantity: ${quantity}`,
      );

      const existingItem = await this.prisma.orderItem.findFirst({
        where: {
          sessionId,
          productId,
          orderId: null,
        },
      });

      if (!existingItem) {
        throw new HttpException('Cart item not found', HttpStatus.NOT_FOUND);
      }

      if (quantity <= 0) {
        await this.prisma.orderItem.delete({
          where: { id: existingItem.id },
        });

        // Invalidate cache
        await this.cacheService.invalidateCart(sessionId);

        return { deleted: true };
      }

      // Get product price for recalculation
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      const updatedItem = await this.prisma.orderItem.update({
        where: { id: existingItem.id },
        data: {
          quantity,
          price: product.price.toNumber() * quantity,
        },
        include: {
          product: {
            include: {
              images: { take: 1 },
            },
          },
        },
      });

      // Invalidate cache
      await this.cacheService.invalidateCart(sessionId);

      return {
        id: updatedItem.id,
        productId: updatedItem.productId,
        quantity: updatedItem.quantity,
        product: {
          id: updatedItem.product.id,
          name: updatedItem.product.name,
          price: updatedItem.product.price,
          image: updatedItem.product.images[0]?.url || null,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error updating cart item: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update cart item',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async removeItem(sessionId: string, productId: string) {
    try {
      this.logger.log(`Removing item from cart: ${productId}`);

      const existingItem = await this.prisma.orderItem.findFirst({
        where: {
          sessionId,
          productId,
          orderId: null,
        },
      });

      if (!existingItem) {
        throw new HttpException('Cart item not found', HttpStatus.NOT_FOUND);
      }

      await this.prisma.orderItem.delete({
        where: { id: existingItem.id },
      });

      // Invalidate cache
      await this.cacheService.invalidateCart(sessionId);

      return { deleted: true };
    } catch (error) {
      this.logger.error(
        `Error removing cart item: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to remove cart item',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async clearCart(sessionId: string) {
    try {
      this.logger.log(`Clearing cart for session: ${sessionId}`);

      await this.prisma.orderItem.deleteMany({
        where: {
          sessionId,
          orderId: null,
        },
      });

      // Invalidate cache
      await this.cacheService.invalidateCart(sessionId);

      return { cleared: true };
    } catch (error) {
      this.logger.error(`Error clearing cart: ${error.message}`, error.stack);
      throw new HttpException(
        'Failed to clear cart',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
