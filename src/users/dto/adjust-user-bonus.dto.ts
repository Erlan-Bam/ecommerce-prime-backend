import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AdjustUserBonusDto {
  @ApiProperty({
    example: 500,
    description: 'Количество бонусов',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({
    required: false,
    example: 'Ручная корректировка администратором',
    description: 'Комментарий к операции',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
