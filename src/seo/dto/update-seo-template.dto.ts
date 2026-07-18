import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateSeoTemplateDto {
  @ApiPropertyOptional({
    description: 'Title template with variables such as [Название]',
  })
  @IsOptional()
  @IsString()
  titleTemplate?: string;

  @ApiPropertyOptional({
    description: 'Description template with variables such as [Цена]',
  })
  @IsOptional()
  @IsString()
  descriptionTemplate?: string;

  @ApiPropertyOptional({
    description: 'H1 template with variables such as [Название]',
  })
  @IsOptional()
  @IsString()
  h1Template?: string;
}
