import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class AddGuestCartItemDto {
  @ApiProperty({
    description: 'Product ID to add to cart',
    example: 'product-uuid',
  })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({
    description: 'Quantity to add',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  quantity: number = 1;
}

export class UpdateGuestCartItemDto {
  @ApiProperty({
    description: 'New quantity',
    example: 2,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  quantity: number;
}
