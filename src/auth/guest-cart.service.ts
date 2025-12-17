import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { AddGuestCartItemDto } from './dto';

@Injectable()
export class GuestCartService {
  private readonly logger = new Logger(GuestCartService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCart(sessionId: string) {
    try {
      this.logger.log(`Getting cart for session: ${sessionId}`);

      const cartItems = await this.prisma.guestCartItem.findMany({
        where: { sessionId },
        include: {
          product: {
            include: {
              images: {
                orderBy: { sortOrder: 'asc' },
                take: 1,
              },
              category: {
                select: { id: true, title: true, slug: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const items = cartItems.map((item) => ({
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
          category: item.product.category,
        },
        subtotal: Number(item.product.price) * item.quantity,
      }));

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

      return {
        items,
        itemCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        total,
      };
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
      const existingItem = await this.prisma.guestCartItem.findUnique({
        where: {
          sessionId_productId: {
            sessionId,
            productId: dto.productId,
          },
        },
      });

      if (existingItem) {
        // Update quantity
        const updatedItem = await this.prisma.guestCartItem.update({
          where: { id: existingItem.id },
          data: { quantity: existingItem.quantity + dto.quantity },
          include: {
            product: {
              include: {
                images: { take: 1 },
              },
            },
          },
        });

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
      const cartItem = await this.prisma.guestCartItem.create({
        data: {
          sessionId,
          productId: dto.productId,
          quantity: dto.quantity,
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

      const existingItem = await this.prisma.guestCartItem.findUnique({
        where: {
          sessionId_productId: {
            sessionId,
            productId,
          },
        },
      });

      if (!existingItem) {
        throw new HttpException('Cart item not found', HttpStatus.NOT_FOUND);
      }

      if (quantity <= 0) {
        await this.prisma.guestCartItem.delete({
          where: { id: existingItem.id },
        });
        return { deleted: true };
      }

      const updatedItem = await this.prisma.guestCartItem.update({
        where: { id: existingItem.id },
        data: { quantity },
        include: {
          product: {
            include: {
              images: { take: 1 },
            },
          },
        },
      });

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

      const existingItem = await this.prisma.guestCartItem.findUnique({
        where: {
          sessionId_productId: {
            sessionId,
            productId,
          },
        },
      });

      if (!existingItem) {
        throw new HttpException('Cart item not found', HttpStatus.NOT_FOUND);
      }

      await this.prisma.guestCartItem.delete({
        where: { id: existingItem.id },
      });

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

      await this.prisma.guestCartItem.deleteMany({
        where: { sessionId },
      });

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
