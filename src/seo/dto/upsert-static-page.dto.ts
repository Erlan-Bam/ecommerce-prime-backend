import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class StaticPageBlockDto {
  @ApiProperty({ description: 'Registered page block type' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiProperty({ description: 'Block-specific settings and content' })
  @IsObject()
  data: Record<string, unknown>;
}

export class UpsertStaticPageDto {
  @ApiProperty({ description: 'Page path, for example /about' })
  @IsString()
  path: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  seoH1?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [StaticPageBlockDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StaticPageBlockDto)
  blocks: StaticPageBlockDto[];
}
