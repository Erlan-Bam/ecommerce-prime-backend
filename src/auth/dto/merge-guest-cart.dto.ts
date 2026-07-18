import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MergeGuestCartDto {
  @ApiProperty({
    description: 'Guest session ID whose cart should be merged into user cart',
    example: '9b41f623-c904-4f20-8f2f-7f148b4c2322',
  })
  @IsUUID()
  guestSessionId: string;
}
