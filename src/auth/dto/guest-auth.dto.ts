import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class GuestAuthDto {
  @ApiProperty({
    description:
      'Device fingerprint - unique identifier based on device hardware/software',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  })
  @IsNotEmpty()
  @IsString()
  fingerprint: string;

  @ApiProperty({
    description: 'User agent string from browser',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class GuestAuthResponseDto {
  @ApiProperty({
    description: 'Guest session information',
    example: {
      id: 'uuid',
      fingerprint: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      isGuest: true,
    },
  })
  guest: {
    id: string;
    fingerprint: string;
    isGuest: boolean;
  };

  @ApiProperty({
    description: 'JWT access token for guest',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token for guest',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;
}
