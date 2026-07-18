import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddOrderItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Quantity of the product', minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ description: 'Selected variant key', required: false })
  @IsOptional()
  @IsString()
  variantKey?: string;

  @ApiProperty({ description: 'Selected variant label', required: false })
  @IsOptional()
  @IsString()
  variantLabel?: string;
}
