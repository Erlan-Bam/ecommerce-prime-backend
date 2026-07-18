import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateStaticPageSeoDto {
  @ApiProperty({ description: 'Static page path, for example /about' })
  @IsString()
  path: string;

  @ApiPropertyOptional({ description: 'Admin-facing page name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Fallback page title/name' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Manual SEO title override' })
  @IsOptional()
  @IsString()
  seoTitle?: string;

  @ApiPropertyOptional({ description: 'Manual SEO description override' })
  @IsOptional()
  @IsString()
  seoDescription?: string;

  @ApiPropertyOptional({ description: 'Manual H1 override' })
  @IsOptional()
  @IsString()
  seoH1?: string;

  @ApiPropertyOptional({ description: 'Whether this SEO record is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
