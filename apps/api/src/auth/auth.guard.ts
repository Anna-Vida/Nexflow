import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

export type AuthenticatedRequest = Request & { user: { id: string; email: string; name?: string | null } };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.auth.userFromCookie(request.headers.cookie);
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    request.user = user;
    return true;
  }
}
