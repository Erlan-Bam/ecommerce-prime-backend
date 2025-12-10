import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsDateString,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export enum CouponType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
}

export class CreateCouponDto {
  @ApiProperty({ description: 'Coupon code', example: 'SUMMER2024' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'Coupon type',
    enum: CouponType,
    example: CouponType.PERCENTAGE,
  })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({ description: 'Discount value', example: 10 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty({
    description: 'Valid from date',
    example: '2024-01-01T00:00:00Z',
  })
  @IsDateString()
  validFrom: string;

  @ApiProperty({
    description: 'Valid to date',
    example: '2024-12-31T23:59:59Z',
  })
  @IsDateString()
  validTo: string;

  @ApiPropertyOptional({
    description: 'Usage limit (0 = unlimited)',
    default: 0,
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Is coupon active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
