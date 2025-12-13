import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, IsNotEmpty, Min } from 'class-validator';
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
}
