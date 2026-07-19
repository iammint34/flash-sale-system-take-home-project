import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import {
  CONFIG_CHANGED_CHANNEL,
  RATE_LIMIT_KEY,
  RateLimitConfig,
} from './rate-limit.constants';

// runtime-tunable rate-limit config: durable in a redis hash, cached in-process,
// and propagated across instances via pub/sub. `.env` only supplies the defaults.
@Injectable()
export class RateLimitConfigService implements OnModuleInit, OnModuleDestroy {
  private config: RateLimitConfig;
  private sub?: Redis;

  constructor(
    private readonly redis: RedisService,
    private readonly env: ConfigService,
  ) {
    // seed the cache from env so limits resolve even before the redis read
    this.config = this.env.getOrThrow<RateLimitConfig>('rateLimit');
  }

  async onModuleInit() {
    if (!(await this.redis.exists(RATE_LIMIT_KEY))) await this.write(this.config);
    await this.reload();

    this.sub = this.redis.duplicate();
    await this.sub.subscribe(CONFIG_CHANGED_CHANNEL);
    this.sub.on('message', () => {
      this.reload().catch(() => undefined);
    });
  }

  onModuleDestroy() {
    this.sub?.disconnect();
  }

  current(): RateLimitConfig {
    return this.config;
  }

  async update(patch: Partial<RateLimitConfig>): Promise<RateLimitConfig> {
    const next = { ...this.config, ...patch };
    await this.write(next);
    this.config = next;
    // tell the other instances to reload
    await this.redis.publish(CONFIG_CHANGED_CHANNEL, 'rate_limit');
    return next;
  }

  // force back to env defaults (used by the seed script)
  resetToEnv(): Promise<RateLimitConfig> {
    return this.update(this.env.getOrThrow<RateLimitConfig>('rateLimit'));
  }

  private async reload() {
    const h = await this.redis.hgetall(RATE_LIMIT_KEY);
    if (!h.ttl) return;
    this.config = {
      ttl: parseInt(h.ttl, 10),
      max: parseInt(h.max, 10),
      enabled: h.enabled === 'true',
    };
  }

  private async write(c: RateLimitConfig) {
    await this.redis.hset(RATE_LIMIT_KEY, {
      ttl: c.ttl,
      max: c.max,
      enabled: String(c.enabled),
    });
  }
}
