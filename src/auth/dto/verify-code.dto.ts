import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCodeDto {
  @ApiProperty({
    example: '+7 999 123 45 67',
    description:
      'User phone number from CIS countries in format +[country_code] XXX XXX XX XX',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(?:\+(?:7|373|374|375|380|992|993|994|995|996|998)|8)[\s\(\)-]?\d{1,4}[\s\(\)-]?\d{1,4}[\s\(\)-]?\d{1,4}(?:[\s\(\)-]?\d{1,4})?$/,
    {
      message:
        'Phone must be from CIS country with valid format (e.g., +7 999 123 45 67, 89991234567)',
    },
  )
  phone: string;

  @ApiProperty({
    example: '1234',
    description: '4-digit verification code',
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'Code must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'Code must contain only digits' })
  code: string;
}
