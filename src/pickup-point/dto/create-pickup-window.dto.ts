import { IsString, IsDateString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePickupWindowDto {
  @ApiProperty({
    description: 'ID of the pickup point',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  pointId: string;

  @ApiProperty({
    description: 'Start time of the pickup window',
    example: '2026-01-20T10:00:00.000Z',
  })
  @IsDateString()
  startTime: string;

  @ApiProperty({
    description: 'End time of the pickup window',
    example: '2026-01-20T12:00:00.000Z',
  })
  @IsDateString()
  endTime: string;

  @ApiProperty({
    description: 'Maximum number of orders for this window',
    example: 10,
    default: 24,
  })
  @IsInt()
  @Min(1)
  capacity: number;
}
