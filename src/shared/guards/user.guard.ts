import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

type JwtUser = {
  id: string;
  role: 'USER' | 'ADMIN';
  isBanned: boolean;
};

@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: JwtUser }>();
    const user = req.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    if (user.isBanned) {
      throw new ForbiddenException('Access denied: User is banned');
    }

    return true;
  }
}
