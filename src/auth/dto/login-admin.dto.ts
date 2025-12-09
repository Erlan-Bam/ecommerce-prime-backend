import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginAdminDto {
  @ApiProperty({
    example: 'admin@example.com',
    description: 'Admin email',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'adminpassword123', description: 'Admin password' })
  @IsString()
  @MinLength(6)
  password: string;
}
