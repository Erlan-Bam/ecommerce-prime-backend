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
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiProperty({ description: 'Discount value', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @ApiProperty({
    description: 'Valid from date',
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiProperty({
    description: 'Valid to date',
    example: '2024-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  validTo?: string;

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

  // Legacy admin panel compatibility
  @ApiPropertyOptional({
    description: 'Legacy discount type field',
    enum: CouponType,
    example: CouponType.PERCENTAGE,
  })
  @IsOptional()
  @IsEnum(CouponType)
  discountType?: CouponType;

  @ApiPropertyOptional({
    description: 'Legacy discount value field',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiPropertyOptional({
    description: 'Legacy max uses field',
    default: 0,
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxUses?: number;

  @ApiPropertyOptional({
    description: 'Legacy start date field',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Legacy end date field',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Legacy/admin-only description field (ignored by backend)',
    example: 'Coupon for seasonal campaign',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Legacy/admin-only minimum order amount field (ignored)',
    example: 1000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({
    description: 'Legacy/admin-only per-user usage field (ignored)',
    example: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  usesPerUser?: number;
}
