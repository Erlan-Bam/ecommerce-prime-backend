import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RemoveOrderItemDto {
  @ApiProperty({ description: 'Order Item ID to remove' })
  @IsString()
  @IsNotEmpty()
  orderItemId: string;
}
