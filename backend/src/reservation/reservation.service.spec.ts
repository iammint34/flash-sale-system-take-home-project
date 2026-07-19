import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import configuration from '../config/configuration';
import { envValidationSchema } from '../config/env.validation';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { ReservationModule } from './reservation.module';
import {
  ReservationService,
  buyersKey,
  stockKey,
} from './reservation.service';

// integration test against the real redis from docker-compose
describe('ReservationService (redis)', () => {
  let service: ReservationService;
  let redis: RedisService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          validationSchema: envValidationSchema,
        }),
        RedisModule,
        ReservationModule,
      ],
    }).compile();

    service = moduleRef.get(ReservationService);
    redis = moduleRef.get(RedisService);
  });

  afterAll(() => {
    redis.disconnect();
  });

  const fresh = async (saleId: string, stock: number) => {
    await redis.del(stockKey(saleId), buyersKey(saleId));
    await service.resetStock(saleId, stock);
  };

  it('reserves one unit and decrements stock', async () => {
    const sale = 'm2-single';
    await fresh(sale, 5);

    expect(await service.reserve(sale, 'u1')).toBe('success');
    expect(await service.getRemaining(sale)).toBe(4);
    expect(await service.hasReserved(sale, 'u1')).toBe(true);
  });

  it('rejects a second attempt by the same user without decrementing', async () => {
    const sale = 'm2-dup';
    await fresh(sale, 5);

    expect(await service.reserve(sale, 'u1')).toBe('success');
    expect(await service.reserve(sale, 'u1')).toBe('already_purchased');
    expect(await service.getRemaining(sale)).toBe(4);
  });

  it('reports sold_out once stock hits zero', async () => {
    const sale = 'm2-soldout';
    await fresh(sale, 1);

    expect(await service.reserve(sale, 'u1')).toBe('success');
    expect(await service.reserve(sale, 'u2')).toBe('sold_out');
    expect(await service.getRemaining(sale)).toBe(0);
  });

  // the point of the whole milestone: no oversell under a concurrent rush
  it('never oversells under 1000 concurrent unique buyers for 100 units', async () => {
    const sale = 'm2-rush';
    const stock = 100;
    const contenders = 1000;
    await fresh(sale, stock);

    const results = await Promise.all(
      Array.from({ length: contenders }, (_, i) =>
        service.reserve(sale, `u${i}`),
      ),
    );

    const successes = results.filter((r) => r === 'success').length;
    const soldOut = results.filter((r) => r === 'sold_out').length;

    expect(successes).toBe(stock);
    expect(soldOut).toBe(contenders - stock);
    expect(await service.getRemaining(sale)).toBe(0);
  });

  // one-per-user must hold even when a single user fires many attempts at once
  it('lets a user win at most once under concurrent duplicate attempts', async () => {
    const sale = 'm2-oneuser';
    await fresh(sale, 100);

    const results = await Promise.all(
      Array.from({ length: 50 }, () => service.reserve(sale, 'sameUser')),
    );

    expect(results.filter((r) => r === 'success').length).toBe(1);
    expect(await service.getRemaining(sale)).toBe(99);
  });
});
