import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductStockDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Pickup Point ID' })
  @IsString()
  @IsNotEmpty()
  pointId: string;

  @ApiProperty({ description: 'SKU (Stock Keeping Unit)' })
  @IsString()
  @IsNotEmpty()
  sku: string;

  @ApiPropertyOptional({ description: 'Stock count', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockCount?: number;
}

export class UpdateProductStockDto {
  @ApiPropertyOptional({ description: 'SKU (Stock Keeping Unit)' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Stock count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stockCount?: number;
}

export class BulkProductStockDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Array of stock entries for pickup points',
    type: [CreateProductStockDto],
  })
  stocks: CreateProductStockDto[];
}
