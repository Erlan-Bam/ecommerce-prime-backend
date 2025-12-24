import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsObject,
} from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreatePickupPointDto {
  @ApiProperty({ description: 'Pickup point name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Pickup point address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ description: 'Coordinates in "lat,lng" format' })
  @IsString()
  @IsNotEmpty()
  coords: string;

  @ApiProperty({
    description: 'Working schedule as JSON',
    example: {
      Пн: { from: '09:00', to: '18:00' },
      Вт: { from: '09:00', to: '18:00' },
      Ср: { from: '09:00', to: '18:00' },
      Чт: { from: '09:00', to: '18:00' },
      Пт: { from: '09:00', to: '18:00' },
      Сб: null,
      Вс: null,
    },
  })
  @IsObject()
  workingSchedule: Prisma.InputJsonValue;

  @ApiPropertyOptional({ description: 'URL for the pickup point' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'Is pickup point active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
