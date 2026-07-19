import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { DynamicThrottlerGuard } from './dynamic-throttler.guard';
import { RateLimitConfigService } from './rate-limit-config.service';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [RateLimitConfigService, ConfigService],
      useFactory: (rl: RateLimitConfigService, env: ConfigService) => ({
        // resolved per request from the live redis-backed config (ms);
        // the enabled toggle is handled by the guard's shouldSkip
        throttlers: [
          {
            ttl: () => rl.current().ttl * 1000,
            limit: () => rl.current().max,
          },
        ],
        // redis storage → counters are shared across all PM2 instances
        storage: new ThrottlerStorageRedisService(
          env.getOrThrow<string>('redisUrl'),
        ),
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: DynamicThrottlerGuard }],
})
export class RateLimitModule {}
