import { Global, Module } from '@nestjs/common';
import { PublicRateLimitGuard } from './public-rate-limit.guard.js';
import { RateLimitService } from './rate-limit.service.js';

@Global()
@Module({
  providers: [RateLimitService, PublicRateLimitGuard],
  exports: [RateLimitService, PublicRateLimitGuard],
})
export class SecurityModule {}
