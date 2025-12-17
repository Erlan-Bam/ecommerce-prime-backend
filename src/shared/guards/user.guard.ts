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
      // If token is expired or invalid, return 401
      if (info?.name === 'TokenExpiredError') {
        throw new HttpException('Token expired', HttpStatus.UNAUTHORIZED);
      }
      if (info?.name === 'JsonWebTokenError') {
        throw new HttpException('Invalid token', HttpStatus.UNAUTHORIZED);
      }
      throw error || new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
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
