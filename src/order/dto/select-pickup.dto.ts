import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsDateString } from 'class-validator';

export class SelectPickupDto {
  @ApiProperty({
    description: 'Pickup point ID',
    example: 'uuid-of-pickup-point',
  })
  @IsNotEmpty()
  @IsUUID()
  pointId: string;

  @ApiProperty({
    description:
      'Desired pickup time in ISO format (Moscow time). Will be assigned to the appropriate hourly window (10:00-21:00)',
    example: '2025-12-16T14:30:00+03:00',
  })
  @IsNotEmpty()
  @IsDateString()
  pickupTime: string;
}

export class SelectPickupResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({ description: 'Pickup point details' })
  pickupPoint: {
    id: string;
    address: string;
  };

  @ApiProperty({ description: 'Pickup window details' })
  pickupWindow: {
    id: string;
    startTime: Date;
    endTime: Date;
  };

  @ApiProperty({ description: 'Message' })
  message: string;
}
