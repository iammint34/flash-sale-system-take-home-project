import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// teach ioredis about our custom scripted command (EVALSHA + auto EVAL fallback)
declare module 'ioredis' {
  interface RedisCommander<Context> {
    reserveItem(
      stockKey: string,
      buyersKey: string,
      userId: string,
    ): Promise<number>;
    applyStock(
      stockKey: string,
      buyersKey: string,
      newTotal: string | number,
    ): Promise<number>;
  }
}

export type ReserveResult = 'success' | 'sold_out' | 'already_purchased';

const RESULT: Record<number, ReserveResult> = {
  1: 'success',
  0: 'sold_out',
  2: 'already_purchased',
};

// runs as one uninterruptible step on single-threaded redis (nothing else runs
// mid-script): dedup the user and decrement stock together, so concurrent callers
// can never oversell or let one user win twice
const RESERVE_LUA = `
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then
  return 2
end
local stock = tonumber(redis.call('GET', KEYS[1]))
if not stock or stock <= 0 then
  return 0
end
redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
return 1
`;

// admin set of the total: derive remaining from already-reserved in one
// uninterruptible step, so it can't clobber concurrent reserves or drop remaining
// below what's sold
const APPLY_STOCK_LUA = `
local reserved = redis.call('SCARD', KEYS[2])
local remaining = tonumber(ARGV[1]) - reserved
if remaining < 0 then remaining = 0 end
redis.call('SET', KEYS[1], remaining)
return remaining
`;

export const stockKey = (saleId: string) => `sale:${saleId}:stock`;
export const buyersKey = (saleId: string) => `sale:${saleId}:buyers`;

@Injectable()
export class ReservationService {
  constructor(private readonly redis: RedisService) {
    this.redis.defineCommand('reserveItem', {
      numberOfKeys: 2,
      lua: RESERVE_LUA,
    });
    this.redis.defineCommand('applyStock', {
      numberOfKeys: 2,
      lua: APPLY_STOCK_LUA,
    });
  }

  async reserve(saleId: string, userId: string): Promise<ReserveResult> {
    const code = await this.redis.reserveItem(
      stockKey(saleId),
      buyersKey(saleId),
      userId,
    );
    return RESULT[code];
  }

  // fresh sale: clear buyers and set the full stock (seed / reset)
  async resetStock(saleId: string, total: number): Promise<void> {
    await this.redis.del(buyersKey(saleId));
    await this.redis.set(stockKey(saleId), total);
  }

  // admin re-total mid-sale; returns the new remaining after accounting for sold units
  async applyStockTotal(saleId: string, total: number): Promise<number> {
    return this.redis.applyStock(stockKey(saleId), buyersKey(saleId), total);
  }

  async getRemaining(saleId: string): Promise<number> {
    const v = await this.redis.get(stockKey(saleId));
    return v ? parseInt(v, 10) : 0;
  }

  async hasReserved(saleId: string, userId: string): Promise<boolean> {
    return (await this.redis.sismember(buyersKey(saleId), userId)) === 1;
  }

  // every winner (≤ total stock), used to reconcile redis reservations vs orders
  async getBuyers(saleId: string): Promise<string[]> {
    return this.redis.smembers(buyersKey(saleId));
  }
}
