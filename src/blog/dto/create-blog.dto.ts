import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  Matches,
} from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateBlogDto {
  @ApiProperty({
    description: 'Blog post title',
    example: 'Welcome to our store',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Blog post content (HTML or markdown)',
    example: '<p>Welcome to our amazing store...</p>',
  })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'welcome-to-our-store',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be URL-friendly (lowercase letters, numbers, and hyphens only)',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'SEO meta data (description, keywords, ogImage)',
    example: { description: 'SEO description', keywords: 'key1, key2', ogImage: 'https://example.com/image.jpg' },
  })
  @IsOptional()
  @IsObject()
  meta?: Prisma.InputJsonValue;

  @ApiPropertyOptional({
    description: 'Whether the post is published',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
