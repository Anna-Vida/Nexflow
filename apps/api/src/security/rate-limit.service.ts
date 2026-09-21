import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { redisConnection } from '../queue/workflow-queue.js';

const incrementWithExpiry = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
  return count
`;

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis = process.env.NODE_ENV === 'production'
    ? new Redis({ ...redisConnection(false), lazyConnect: true })
    : null;

  async check(bucket: string, identity: string, limit: number, seconds: number) {
    if (!this.redis) return;

    const digest = createHash('sha256').update(identity).digest('hex');
    try {
      const count = Number(await this.redis.eval(incrementWithExpiry, 1, `nexflow:rate:${bucket}:${digest}`, seconds));
      if (count > limit) throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Request protection is unavailable.');
    }
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }
}
