import { HttpException, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../services/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('Missing JWT_ACCESS_SECRET in configuration');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    try {
      const user = await this.prisma.account.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          telegramId: true,
          role: true,
          isBanned: true,
          createdAt: true,
        },
      });

      if (!user) {
        throw new HttpException('User not found', 404);
      }

      if (user.isBanned) {
        throw new HttpException('User is banned', 403);
      }

      return {
        id: user.id,
        role: user.role,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Invalid token', 401);
    }
  }
}
