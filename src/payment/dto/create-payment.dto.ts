import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsInt } from 'class-validator';
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
    enum: PaymentMethod,
    example: PaymentMethod.CASH,
    enumName: 'PaymentMethod',
  })
  @IsEnum(PaymentMethod, {
    message: 'Payment method must be one of: ROBOKASSA, CASH',
  })
  @IsNotEmpty()
  paymentMethod: PaymentMethod;
}
