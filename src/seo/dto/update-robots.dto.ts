import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateRobotsDto {
  @ApiProperty({ description: 'Full robots.txt content' })
  @IsString()
  content: string;
}
