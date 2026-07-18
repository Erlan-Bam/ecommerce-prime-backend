import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../shared/dto/pagination.dto';

export class CategoryListQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Include inactive categories in the list',
    example: false,
    default: false,
    type: Boolean,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeInactive?: boolean = false;
}
