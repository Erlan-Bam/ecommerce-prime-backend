import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryMethod, PaymentMethod } from '@prisma/client';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDateString,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class FinalizeOrderDto {
  @ApiProperty({
    description: 'Delivery method',
    enum: DeliveryMethod,
    example: 'PICKUP',
  })
  @IsNotEmpty()
  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod;

  @ApiProperty({
    description: 'Buyer full name (first, last, middle names)',
    example: 'Иванов Иван Иванович',
  })
  @IsNotEmpty()
  @IsString()
  buyer: string;

  @ApiProperty({
    description: 'Contact email',
    example: 'customer@example.com',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Contact phone number',
    example: '+7 999 123 45 67',
  })
  @IsNotEmpty()
  @IsString()
  phone: string;

  // PICKUP specific fields
  @ApiPropertyOptional({
    description: 'Pickup point ID (required for PICKUP delivery method)',
    example: 'uuid-of-pickup-point',
  })
  @ValidateIf((o) => o.deliveryMethod === 'PICKUP')
  @IsNotEmpty({ message: 'Pickup point ID is required for pickup delivery' })
  @IsUUID()
  pointId?: string;

  @ApiPropertyOptional({
    description:
      'Desired pickup time in ISO format (required for PICKUP). Will be assigned to the appropriate hourly window (10:00-21:00 Moscow time)',
    example: '2025-12-16T14:30:00+03:00',
  })
  @ValidateIf((o) => o.deliveryMethod === 'PICKUP')
  @IsNotEmpty({ message: 'Pickup time is required for pickup delivery' })
  @IsDateString()
  pickupTime?: string;

  // DELIVERY specific fields
  @ApiPropertyOptional({
    description: 'Delivery address (required for DELIVERY delivery method)',
    example: 'г. Москва, ул. Примерная, д. 1, кв. 10',
  })
  @ValidateIf((o) => o.deliveryMethod === 'DELIVERY')
  @IsNotEmpty({ message: 'Address is required for delivery' })
  @IsString()
  address?: string;

  // Payment options
  @ApiProperty({
    description: 'Payment method',
    enum: PaymentMethod,
    example: 'CASH',
  })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({
    description:
      'Pay later option - if true, payment will be collected on delivery/pickup. Only available with CASH payment method.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  payLater?: boolean;
}

export class FinalizeOrderResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: number;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({ description: 'Delivery method' })
  deliveryMethod: string;

  @ApiProperty({ description: 'Payment method' })
  paymentMethod: string;

  @ApiProperty({ description: 'Total order price' })
  total: number;

  @ApiProperty({ description: 'Discount amount' })
  discount: number;

  @ApiProperty({ description: 'Final total after discount' })
  finalTotal: number;

  @ApiProperty({ description: 'Buyer full name' })
  buyer: string;

  @ApiProperty({ description: 'Contact email' })
  email: string;

  @ApiProperty({ description: 'Contact phone' })
  phone: string;

  @ApiPropertyOptional({
    description: 'Delivery address (for DELIVERY method)',
  })
  address?: string;

  @ApiPropertyOptional({
    description: 'Pickup point details (for PICKUP method)',
  })
  pickupPoint?: {
    id: string;
    name: string;
    address: string;
  };

  @ApiPropertyOptional({
    description: 'Pickup window details (for PICKUP method)',
  })
  pickupWindow?: {
    id: string;
    startTime: Date;
    endTime: Date;
  };

  @ApiProperty({ description: 'Pay later option' })
  payLater: boolean;

  @ApiProperty({ description: 'Message' })
  message: string;
}
