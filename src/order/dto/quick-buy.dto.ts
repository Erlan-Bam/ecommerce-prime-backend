import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsInt,
  IsString,
  IsEmail,
  IsOptional,
  Min,
  Matches,
} from 'class-validator';

export class QuickBuyDto {
  @ApiProperty({
    description: 'Product ID',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  productId: number;

  @ApiPropertyOptional({
    description: 'Quantity (default: 1)',
    example: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number = 1;

  @ApiProperty({
    description: 'Customer name',
    example: 'Иван Иванов',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

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

  @ApiPropertyOptional({
    description: 'Customer email',
    example: 'ivan@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Comment to the order',
    example: 'Перезвоните для уточнения деталей',
  })
  @IsString()
  @IsOptional()
  comment?: string;
}

export class QuickBuyResponseDto {
  @ApiProperty({ description: 'Order ID' })
  orderId: number;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({ description: 'Order total' })
  total: number;

  @ApiProperty({ description: 'Customer info' })
  customer: {
    name: string;
    phone: string;
    email?: string;
  };

  @ApiProperty({ description: 'Product info' })
  product: {
    id: number;
    name: string;
    price: number;
    quantity: number;
  };

  @ApiProperty({ description: 'Message' })
  message: string;
}
