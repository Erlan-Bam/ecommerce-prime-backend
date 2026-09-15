import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpsertSeoTagTileDto {
  @ApiProperty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  image?: string | null;

  /**
   * Legacy single-category field. Kept for backwards compatibility while
   * categoryIds is the canonical field for new clients.
   */
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  collectionId?: string | null;

  @IsOptional()
  @IsString()
  url?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sortOrder?: number;
}
