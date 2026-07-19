export const RATE_LIMIT_KEY = 'config:rate_limit';
export const CONFIG_CHANGED_CHANNEL = 'config:changed';

export type RateLimitConfig = {
  ttl: number; // seconds
  max: number; // requests per window
  enabled: boolean;
};
