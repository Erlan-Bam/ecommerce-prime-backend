import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { FavoriteService } from './favorite.service';
import { UserGuard } from '../shared/guards/user.guard';
import { User } from '../shared/decorator/user.decorator';

@ApiTags('Favorites')
@Controller('favorites')
@UseGuards(UserGuard)
@ApiBearerAuth('JWT')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Get()
  @ApiOperation({ summary: 'Get all favorite products for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Favorites retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getFavorites(@User('id') userId: string) {
    return this.favoriteService.getFavorites(userId);
  }

  @Get('count')
  @ApiOperation({ summary: 'Get favorites count for the current user' })
  @ApiResponse({
    status: 200,
    description: 'Favorites count retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getFavoritesCount(@User('id') userId: string) {
    const count = await this.favoriteService.getFavoritesCount(userId);
    return { count };
  }

  @Post(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a product to favorites' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description: 'Product added to favorites',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  addToFavorites(
    @User('id') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.favoriteService.addToFavorites(userId, productId);
  }

  @Delete(':productId')
  @ApiOperation({ summary: 'Remove a product from favorites' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description: 'Product removed from favorites',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Favorite not found' })
  removeFromFavorites(
    @User('id') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.favoriteService.removeFromFavorites(userId, productId);
  }

  @Get('check/:productId')
  @ApiOperation({ summary: 'Check if a product is in favorites' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description: 'Check result',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkFavorite(
    @User('id') userId: string,
    @Param('productId') productId: string,
  ) {
    const isFavorite = await this.favoriteService.isFavorite(userId, productId);
    return { isFavorite };
  }

  @Delete()
  @ApiOperation({ summary: 'Clear all favorites' })
  @ApiResponse({
    status: 200,
    description: 'All favorites cleared',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  clearFavorites(@User('id') userId: string) {
    return this.favoriteService.clearFavorites(userId);
  }
}
