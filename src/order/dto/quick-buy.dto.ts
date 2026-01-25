import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class QuickBuyDto {
  @ApiProperty({
    description: 'Customer name (buyer)',
    example: 'Иван Иванов',
  })
  @IsString()
  @IsNotEmpty()
  buyer: string;

  @ApiProperty({
    description: 'Customer phone number',
    example: '+7 (999) 123-45-67',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[\d\s\+\-\(\)]+$/, {
    message: 'Phone must contain only digits, spaces, +, -, (, )',
  })
  phone: string;
}

export class QuickBuyResponseDto {
  @ApiProperty({ description: 'Order ID' })
  orderId: number;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({ description: 'Order total' })
  total: number;

  @ApiProperty({ description: 'Number of items in order' })
  itemsCount: number;

  @ApiProperty({ description: 'Customer info' })
  customer: {
    buyer: string;
    phone: string;
  };

  @ApiProperty({ description: 'Order items' })
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }>;

  @ApiProperty({ description: 'Message' })
  message: string;
}
