import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GuestCartController } from './guest-cart.controller';
import { GuestCartService } from './guest-cart.service';
import { GuestGuard } from '../shared/guards/guest.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: '15m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, GuestCartController],
  providers: [AuthService, GuestCartService, GuestGuard],
  exports: [AuthService, GuestCartService, GuestGuard],
})
export class AuthModule {}
