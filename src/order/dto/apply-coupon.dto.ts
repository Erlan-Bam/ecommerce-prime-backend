import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyCouponDto {
  @ApiProperty({
    description: 'Coupon code to apply to the order',
    example: 'SAVE20',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
