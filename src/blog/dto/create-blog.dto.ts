import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { BlogProductPlacement, Prisma } from '@prisma/client';

export class BlogProductBlockItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class BlogProductBlockDto {
  @ApiPropertyOptional({ description: 'Optional block title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: BlogProductPlacement, default: BlogProductPlacement.AFTER_ARTICLE })
  @IsOptional()
  @IsEnum(BlogProductPlacement)
  placement?: BlogProductPlacement;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ type: [BlogProductBlockItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogProductBlockItemDto)
  items: BlogProductBlockItemDto[];
}

export class CreateBlogDto {
  @ApiProperty({ description: 'Blog post title' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ description: 'Blog post content (HTML or markdown)' })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({ description: 'URL-friendly slug' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug must be URL-friendly (lowercase letters, numbers, and hyphens only)' })
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  excerpt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Legacy author name fallback' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: 'BlogAuthor ID' })
  @IsOptional()
  @IsString()
  authorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  readTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  meta?: Prisma.InputJsonValue;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Publication date/time in ISO 8601' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ type: [BlogProductBlockDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogProductBlockDto)
  productBlocks?: BlogProductBlockDto[];
}
