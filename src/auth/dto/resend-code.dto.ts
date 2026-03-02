import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendCodeDto {
  @ApiProperty({
    example: '+7 999 123 45 67',
    description:
      'User phone number from CIS countries in format +[country_code] XXX XXX XX XX',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^\+(?:7|373|374|375|380|992|993|994|995|996|998)[\s\(\)-]?\d{1,4}[\s\(\)-]?\d{1,4}[\s\(\)-]?\d{1,4}(?:[\s\(\)-]?\d{1,4})?$/,
    {
      message:
        'Phone must be from CIS country with valid format (e.g., +7 999 123 45 67, +380 XX XXX XX XX)',
    },
  )
  phone: string;
}
