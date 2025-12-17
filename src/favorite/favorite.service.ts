import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';

@Injectable()
export class FavoriteService {
  constructor(private prisma: PrismaService) {}

  // Get all favorites for a user
  async getFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
            category: true,
            brand: true,
            productStock: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return favorites.map((fav) => ({
      id: fav.id,
      productId: fav.productId,
      product: {
        id: fav.product.id,
        name: fav.product.name,
        slug: fav.product.slug,
        price: fav.product.price.toString(),
        oldPrice: fav.product.oldPrice?.toString() || null,
        image: fav.product.images[0]?.url || null,
        isActive: fav.product.isActive,
        isOnSale: fav.product.isOnSale,
        inStock:
          fav.product.productStock.length > 0 &&
          fav.product.productStock.some((stock) => stock.quantity > 0),
        category: {
          id: fav.product.category.id,
          title: fav.product.category.title,
          slug: fav.product.category.slug,
        },
        brand: fav.product.brand
          ? {
              id: fav.product.brand.id,
              name: fav.product.brand.name,
              slug: fav.product.brand.slug,
            }
          : null,
      },
      createdAt: fav.createdAt,
    }));
  }

  // Add product to favorites
  async addToFavorites(userId: string, productId: string) {
    // Check if product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check if already in favorites
    const existing = await this.prisma.favorite.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (existing) {
      return { message: 'Product already in favorites', favorite: existing };
    }

    // Add to favorites
    const favorite = await this.prisma.favorite.create({
      data: {
        userId,
        productId,
      },
    });

    return { message: 'Product added to favorites', favorite };
  }

  // Remove product from favorites
  async removeFromFavorites(userId: string, productId: string) {
    const favorite = await this.prisma.favorite.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    await this.prisma.favorite.delete({
      where: { id: favorite.id },
    });

    return { message: 'Product removed from favorites' };
  }

  // Check if product is in favorites
  async isFavorite(userId: string, productId: string): Promise<boolean> {
    const favorite = await this.prisma.favorite.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    return !!favorite;
  }

  // Clear all favorites for a user
  async clearFavorites(userId: string) {
    await this.prisma.favorite.deleteMany({
      where: { userId },
    });

    return { message: 'All favorites cleared' };
  }

  // Get favorites count
  async getFavoritesCount(userId: string): Promise<number> {
    return this.prisma.favorite.count({
      where: { userId },
    });
  }
}
