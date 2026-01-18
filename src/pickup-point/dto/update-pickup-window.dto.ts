import { PartialType } from '@nestjs/swagger';
import { CreatePickupWindowDto } from './create-pickup-window.dto';
import { IsInt, Min, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePickupWindowDto extends PartialType(CreatePickupWindowDto) {
  @ApiProperty({
    description: 'Number of reserved slots',
    example: 5,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  reserved?: number;
}
