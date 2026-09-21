import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from './rate-limit.service.js';

@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  constructor(private readonly limits: RateLimitService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const action = context.getHandler().name;

    if (action === 'login' || action === 'register') {
      const email = typeof request.body?.email === 'string'
        ? request.body.email.trim().toLowerCase()
        : 'invalid';
      await this.limits.check(`auth:${action}:global`, 'all', action === 'login' ? 300 : 100, 60);
      await this.limits.check(`auth:${action}:email`, email, action === 'login' ? 10 : 3, 60);
    } else if (action === 'trigger') {
      const token = request.params.token;
      await this.limits.check('webhook:global', 'all', 1000, 60);
      await this.limits.check('webhook:token', typeof token === 'string' ? token : 'invalid', 120, 60);
    }

    return true;
  }
}
