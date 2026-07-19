import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

// RedisService *is* an ioredis client, so callers get ping/eval/decr etc. directly
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService) {
    // lazyConnect keeps boot resilient when redis is down
    super(config.getOrThrow<string>('redisUrl'), {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    this.connect().catch((err) =>
      new Logger(RedisService.name).warn(
        `redis unavailable at boot: ${(err as Error).message}`,
      ),
    );
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
