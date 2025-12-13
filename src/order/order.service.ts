import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { AddOrderItemDto } from './dto';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async addOrderItem(dto: AddOrderItemDto) {
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

    return this.prisma.orderItem.create({
      data: {
        productId: dto.productId,
        quantity: dto.quantity,
        price: product.price,
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
  }

  async removeOrderItem(orderItemId: string): Promise<{ message: string }> {
    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
    });

    if (!orderItem) {
      throw new NotFoundException('Order item not found');
    }

    await this.prisma.orderItem.delete({
      where: { id: orderItemId },
    });

    return { message: 'Order item removed successfully' };
  }
}
