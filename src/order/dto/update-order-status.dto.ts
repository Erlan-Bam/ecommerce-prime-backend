import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    enum: OrderStatus,
    example: OrderStatus.PROCESSING,
    enumName: 'OrderStatus',
  })
  @IsEnum(OrderStatus, {
    message:
      'Status must be one of: PENDING, PROCESSING, CONFIRMED, PAYED, ASSEMBLED, SHIPPED, DELIVERED, CANCELLED',
  })
  @IsNotEmpty()
  status: OrderStatus;
}
