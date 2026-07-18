import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateProductVariantGroupDto {
  @ApiProperty({ description: 'Variant group name shown in admin' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateProductVariantGroupDto {
  @ApiPropertyOptional({ description: 'Variant group name shown in admin' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;
}
