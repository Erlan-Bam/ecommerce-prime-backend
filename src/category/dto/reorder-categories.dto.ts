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

export class ReorderCategoryItemDto {
  @ApiProperty({ description: 'Category ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Display priority', example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sortOrder: number;
}

export class ReorderCategoriesDto {
  @ApiProperty({ type: [ReorderCategoryItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItemDto)
  items: ReorderCategoryItemDto[];
}
