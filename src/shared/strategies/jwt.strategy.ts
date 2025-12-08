import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
      // Проверяем существование пользователя в базе данных
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

      // Если пользователь не найден, выбрасываем ошибку
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Если пользователь заблокирован, выбрасываем ошибку
      if (user.isBanned) {
        throw new UnauthorizedException('User is banned');
      }

      return {
        id: user.id,
        telegramId: user.telegramId.toString(), // Конвертируем BigInt в строку
        role: user.role,
      };
    } catch (error) {
      // Если ошибка уже UnauthorizedException, пробрасываем её
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Для любых других ошибок (например, проблемы с БД)
      throw new UnauthorizedException('Invalid token');
    }
  }
}
