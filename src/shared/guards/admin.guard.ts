// admin.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';

type JwtUser = {
  id: string;
  role: 'USER' | 'ADMIN';
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Access denied: Admins only');
    }
    return true;
  }
}
