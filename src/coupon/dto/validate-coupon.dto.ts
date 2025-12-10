import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({
    description: 'Coupon code to validate',
    example: 'SUMMER2024',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
