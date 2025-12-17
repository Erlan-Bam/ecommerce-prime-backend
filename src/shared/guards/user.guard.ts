import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorator/public.decorator';

@Injectable()
export class UserGuard extends AuthGuard('jwt') {
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
    error: any,
    user: any,
    info: any,
    context: ExecutionContext,
    status?: any,
  ) {
    if (error || !user) {
      throw error || new HttpException('Access denied', HttpStatus.FORBIDDEN);
    }

    if (user.isBanned) {
      throw new HttpException(
        'Access denied: User is banned',
        HttpStatus.FORBIDDEN,
      );
    }

    return user;
  }
}
