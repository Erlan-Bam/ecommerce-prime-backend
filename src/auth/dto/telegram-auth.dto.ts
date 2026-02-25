import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsNumber } from 'class-validator';

export class TelegramAuthDto {
  @ApiProperty({ example: '123456789', description: 'Telegram user ID' })
  @IsNotEmpty()
  @IsNumber()
  id: number;

  @ApiProperty({ example: 'Иван', description: 'Telegram first name' })
  @IsNotEmpty()
  @IsString()
  first_name: string;

  @ApiProperty({
    example: 'Иванов',
    description: 'Telegram last name',
    required: false,
  })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiProperty({
    example: 'ivanov',
    description: 'Telegram username',
    required: false,
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    example: 'https://t.me/i/userpic/320/photo.jpg',
    description: 'Telegram photo URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiProperty({
    example: 1700000000,
    description: 'Unix timestamp of auth date',
  })
  @IsNotEmpty()
  @IsNumber()
  auth_date: number;

  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Telegram data check hash',
  })
  @IsNotEmpty()
  @IsString()
  hash: string;
}
