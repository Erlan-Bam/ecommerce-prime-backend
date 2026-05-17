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
import { ROLES_KEY } from '../decorator/roles.decorator';

const DEFAULT_ADMIN_PANEL_ROLES: Role[] = [Role.ADMIN, Role.MANAGER, Role.EDITOR];

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

    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || DEFAULT_ADMIN_PANEL_ROLES;

    // If user is authenticated but has no access to this route, it's a permission issue (403)
    if (!requiredRoles.includes(user.role)) {
      throw new HttpException(
        'Access denied: insufficient permissions',
        HttpStatus.FORBIDDEN,
      );
    }

    return user;
  }
}
