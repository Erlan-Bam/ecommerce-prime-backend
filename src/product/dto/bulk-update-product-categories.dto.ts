import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class BulkUpdateProductCategoriesDto {
  @ApiProperty({
    description: 'Product IDs to move into the selected category',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  productIds: string[];

  @ApiProperty({ description: 'Target category ID' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
