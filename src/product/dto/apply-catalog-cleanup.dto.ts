import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ApplyCatalogCleanupDto {
  @ApiPropertyOptional({
    description: 'Preview changes without modifying products',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  dryRun?: boolean = true;

  @ApiPropertyOptional({
    description: 'Maximum number of suggested product moves to process',
    default: 500,
    maximum: 5000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number = 500;

  @ApiPropertyOptional({
    description: 'Product IDs that must not be changed by this run',
    type: [String],
    maxItems: 1000,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  excludedProductIds?: string[];
}
