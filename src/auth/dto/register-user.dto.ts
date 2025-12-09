import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({ example: 'Иван Иванов', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '+7 (999) 123-45-67',
    description: 'User phone number',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/, {
    message: 'Phone must be in format +7 (XXX) XXX-XX-XX',
  })
  phone: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email (used as login)',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
