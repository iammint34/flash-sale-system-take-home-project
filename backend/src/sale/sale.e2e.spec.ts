import { getQueueToken } from '@nestjs/bullmq';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { AppModule } from '../app.module';
import { FULFILLMENT_QUEUE } from '../fulfillment/fulfillment.constants';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitConfigService } from '../rate-limit/rate-limit-config.service';
import { ReservationService } from '../reservation/reservation.service';

// full-stack API tests over the real postgres + redis from docker-compose.
// each scenario boots its own app so "the current sale" is unambiguous.
type Ctx = {
  app: NestFastifyApplication;
  prisma: PrismaService;
  reservation: ReservationService;
};

async function boot(): Promise<Ctx> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // these suites drive many requests from one IP to simulate many users, so
  // rate limiting must be off (as it is for stress tests)
  await app.get(RateLimitConfigService).update({ enabled: false });

  return {
    app,
    prisma: app.get(PrismaService),
    reservation: app.get(ReservationService),
  };
}

async function seedSale(
  ctx: Ctx,
  opts: { offsetMin: number; durationMin: number; stock: number },
) {
  const { prisma, reservation } = ctx;
  // clear any jobs left by a prior describe so they can't run against wiped rows
  await ctx.app
    .get<Queue>(getQueueToken(FULFILLMENT_QUEUE))
    .obliterate({ force: true });
  await prisma.order.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.product.deleteMany();

  const start = new Date(Date.now() + opts.offsetMin * 60_000);
  const end = new Date(start.getTime() + opts.durationMin * 60_000);
  const product = await prisma.product.create({ data: { name: 'test-item' } });
  const sale = await prisma.sale.create({
    data: {
      productId: product.id,
      startTime: start,
      endTime: end,
      totalStock: opts.stock,
      inventory: { create: { remaining: opts.stock } },
    },
  });
  await reservation.resetStock(sale.id, opts.stock);
  return sale;
}

async function teardown(ctx: Ctx) {
  // close first so the worker stops before anything it depends on goes away;
  // completed jobs auto-remove (removeOnComplete), so no key cleanup needed
  await ctx.app.close();
}

// light-my-request options; typed loosely to sidestep inject's overloads
const inject = (ctx: Ctx, opts: any) => ctx.app.inject(opts);

describe('Sale API — active sale', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await boot();
    await seedSale(ctx, { offsetMin: -1, durationMin: 60, stock: 5 });
  });
  afterAll(() => teardown(ctx));

  it('GET /sale/status reports active with remaining', async () => {
    const res = await inject(ctx, { method: 'GET', url: '/sale/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'active', remaining: 5 });
  });

  it('POST /sale/purchase succeeds then dedups the same user', async () => {
    const first = await inject(ctx, {
      method: 'POST',
      url: '/sale/purchase',
      payload: { userId: 'alice' },
    });
    expect(first.json()).toEqual({ result: 'success' });

    const again = await inject(ctx, {
      method: 'POST',
      url: '/sale/purchase',
      payload: { userId: 'alice' },
    });
    expect(again.json()).toEqual({ result: 'already_purchased' });
  });

  it('GET /sale/purchase/:userId reflects a winner vs none', async () => {
    // a winner is reserved (redis) or confirmed (worker persisted) — both count
    const winner = (
      await inject(ctx, { method: 'GET', url: '/sale/purchase/alice' })
    ).json().status;
    expect(['reserved', 'confirmed']).toContain(winner);

    expect(
      (await inject(ctx, { method: 'GET', url: '/sale/purchase/ghost' })).json(),
    ).toEqual({ status: 'none' });
  });

  it('rejects an empty userId with 400', async () => {
    const res = await inject(ctx, {
      method: 'POST',
      url: '/sale/purchase',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('admin update requires the admin id and re-totals correctly', async () => {
    const anon = await inject(ctx, {
      method: 'PATCH',
      url: '/admin/sale',
      payload: { totalStock: 50 },
    });
    expect(anon.statusCode).toBe(401);

    // a non-admin id is also rejected
    const notAdmin = await inject(ctx, {
      method: 'PATCH',
      url: '/admin/sale',
      headers: { 'x-user-id': 'alice' },
      payload: { totalStock: 50 },
    });
    expect(notAdmin.statusCode).toBe(401);

    // alice already holds 1; setting total 50 leaves 49 remaining
    const ok = await inject(ctx, {
      method: 'PATCH',
      url: '/admin/sale',
      headers: { 'x-user-id': 'admin123' },
      payload: { totalStock: 50 },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      status: 'active',
      totalStock: 50,
      remaining: 49,
    });
  });

  it('admin can move the sale window', async () => {
    // push the sale into the future → status flips to upcoming
    const start = new Date(Date.now() + 3_600_000).toISOString();
    const end = new Date(Date.now() + 7_200_000).toISOString();
    const res = await inject(ctx, {
      method: 'PATCH',
      url: '/admin/sale',
      headers: { 'x-user-id': 'admin123' },
      payload: { startTime: start, endTime: end },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'upcoming' });

    // reject an inverted window
    const bad = await inject(ctx, {
      method: 'PATCH',
      url: '/admin/sale',
      headers: { 'x-user-id': 'admin123' },
      payload: { startTime: end, endTime: start },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('Sale API — sold out', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await boot();
    await seedSale(ctx, { offsetMin: -1, durationMin: 60, stock: 2 });
  });
  afterAll(() => teardown(ctx));

  it('sells exactly the stock then reports sold_out', async () => {
    const buy = (userId: string) =>
      inject(ctx, {
        method: 'POST',
        url: '/sale/purchase',
        payload: { userId },
      }).then((r) => r.json().result);

    expect(await buy('u1')).toBe('success');
    expect(await buy('u2')).toBe('success');
    expect(await buy('u3')).toBe('sold_out');
    expect(
      (await inject(ctx, { method: 'GET', url: '/sale/status' })).json()
        .remaining,
    ).toBe(0);
  });
});

describe('Sale API — outside the window', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await boot();
    // ended: started 2h ago, ran 1h
    await seedSale(ctx, { offsetMin: -120, durationMin: 60, stock: 5 });
  });
  afterAll(() => teardown(ctx));

  it('reports ended and refuses purchases', async () => {
    expect(
      (await inject(ctx, { method: 'GET', url: '/sale/status' })).json().status,
    ).toBe('ended');

    const res = await inject(ctx, {
      method: 'POST',
      url: '/sale/purchase',
      payload: { userId: 'late' },
    });
    expect(res.json()).toEqual({ result: 'not_active' });
  });
});

describe('Sale API — concurrent rush', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await boot();
    await seedSale(ctx, { offsetMin: -1, durationMin: 60, stock: 50 });
  });
  afterAll(() => teardown(ctx));

  it('never oversells under 300 concurrent unique buyers for 50 units', async () => {
    const results = await Promise.all(
      Array.from({ length: 300 }, (_, i) =>
        inject(ctx, {
          method: 'POST',
          url: '/sale/purchase',
          payload: { userId: `rush-${i}` },
        }).then((r) => r.json().result),
      ),
    );

    expect(results.filter((r) => r === 'success').length).toBe(50);
    expect(results.filter((r) => r === 'sold_out').length).toBe(250);
    expect(
      (await inject(ctx, { method: 'GET', url: '/sale/status' })).json()
        .remaining,
    ).toBe(0);
  });
});
