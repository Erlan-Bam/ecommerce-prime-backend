import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({
    description: 'Order ID to create payment for',
    example: 1,
    type: Number,
  })
  @Type(() => Number)
  @IsInt({ message: 'Order ID must be an integer' })
  @IsNotEmpty()
  orderId: number;

  @ApiProperty({
    description: 'Payment method',
    enum: ['ROBOKASSA'],
    example: PaymentMethod.ROBOKASSA,
    enumName: 'PaymentMethod',
  })
  @IsIn(['ROBOKASSA'], {
    message: 'Only ROBOKASSA payment method is available',
  })
  @IsNotEmpty()
  paymentMethod: PaymentMethod;
}
