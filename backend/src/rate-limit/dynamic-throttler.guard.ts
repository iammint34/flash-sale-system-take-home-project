import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getOptionsToken,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { RateLimitConfigService } from './rate-limit-config.service';

// bypasses throttling entirely when disabled at runtime — a real kill-switch,
// unlike a large limit, which would leave already-blocked clients blocked.
@Injectable()
export class DynamicThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly rl: RateLimitConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(): Promise<boolean> {
    return !this.rl.current().enabled;
  }
}
