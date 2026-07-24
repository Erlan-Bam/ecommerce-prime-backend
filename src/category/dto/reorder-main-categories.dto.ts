import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderMainCategoryItemDto {
  @ApiProperty({ description: 'Category ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Main category display priority', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  mainSortOrder: number;
}

export class ReorderMainCategoriesDto {
  @ApiProperty({ type: [ReorderMainCategoryItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderMainCategoryItemDto)
  items: ReorderMainCategoryItemDto[];
}
