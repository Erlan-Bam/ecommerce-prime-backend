import { ApiProperty } from '@nestjs/swagger';

export class CheckoutResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Total order price' })
  total: number;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({ description: 'Order creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Order items' })
  items: {
    id: string;
    productId: string;
    quantity: number;
    price: number;
    product: {
      id: string;
      name: string;
      slug: string;
    };
  }[];
}
