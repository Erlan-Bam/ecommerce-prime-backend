import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { PaymentStatus } from '@prisma/client';

export class UpdatePaymentStatusDto {
  @ApiProperty({
    description: 'New payment status',
    enum: PaymentStatus,
    example: PaymentStatus.COMPLETED,
    enumName: 'PaymentStatus',
  })
  @IsEnum(PaymentStatus, {
    message: 'Payment status must be one of: PENDING, COMPLETED, REFUNDED',
  })
  @IsNotEmpty()
  status: PaymentStatus;
}
