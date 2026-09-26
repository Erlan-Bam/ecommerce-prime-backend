import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateStyleSheetDto {
  @ApiProperty({ description: 'Stylesheet content' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
