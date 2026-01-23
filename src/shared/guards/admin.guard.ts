import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class AdminGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(
    err: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    // If there's an error or no user, it's an authentication issue (401)
    if (err || !user) {
      throw err || new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    // If user is authenticated but not an admin, it's a permission issue (403)
    if (user.role !== Role.ADMIN) {
      throw new HttpException(
        'Access denied: Admins only',
        HttpStatus.FORBIDDEN,
      );
    }

    return user;
  }
}
