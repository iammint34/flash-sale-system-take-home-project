import { Global, Module } from '@nestjs/common';
import { RateLimitConfigService } from './rate-limit-config.service';

// global so the admin controller + throttler factory share one config source
@Global()
@Module({
  providers: [RateLimitConfigService],
  exports: [RateLimitConfigService],
})
export class RateLimitConfigModule {}
