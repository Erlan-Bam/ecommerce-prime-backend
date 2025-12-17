import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Guest = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const guest = request.guest;

    if (!guest) {
      return null;
    }

    return data ? guest[data] : guest;
  },
);
