import { getQueueToken } from '@nestjs/bullmq';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { Job, Queue } from 'bullmq';
import { AppModule } from '../app.module';
import {
  FULFILLMENT_QUEUE,
  FulfillmentJob,
} from './fulfillment.constants';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitConfigService } from '../rate-limit/rate-limit-config.service';
import { ReservationService } from '../reservation/reservation.service';
import { SaleService } from '../sale/sale.service';
import { FulfillmentProcessor } from './fulfillment.processor';

// exercises the async fulfillment loop: booting the app starts the worker, so
// enqueued jobs become durable orders on their own.
describe('Fulfillment worker (redis + postgres)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let reservation: ReservationService;
  let sale: SaleService;
  let saleId: string;

  const remaining = async () =>
    (await prisma.inventory.findUnique({ where: { saleId } }))!.remaining;

  const waitFor = async (fn: () => Promise<boolean>, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('timed out waiting for condition');
  };

  const confirmed = (userId: string) => async () =>
    (
      await app.inject({ method: 'GET', url: `/sale/purchase/${userId}` })
    ).json().status === 'confirmed';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.get(RateLimitConfigService).update({ enabled: false });

    prisma = app.get(PrismaService);
    reservation = app.get(ReservationService);
    sale = app.get(SaleService);

    // fresh active sale, stock 10
    await app.get<Queue>(getQueueToken(FULFILLMENT_QUEUE)).obliterate({
      force: true,
    });
    await prisma.order.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.product.deleteMany();
    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 3_600_000);
    const product = await prisma.product.create({ data: { name: 'w' } });
    const row = await prisma.sale.create({
      data: {
        productId: product.id,
        startTime: start,
        endTime: end,
        totalStock: 10,
        inventory: { create: { remaining: 10 } },
      },
    });
    saleId = row.id;
    await reservation.resetStock(saleId, 10);
  });

  afterAll(async () => {
    await app.close();
  });

  it('turns a purchase into a confirmed order and decrements durable stock', async () => {
    const before = await remaining();

    await app.inject({
      method: 'POST',
      url: '/sale/purchase',
      payload: { userId: 'alice' },
    });

    await waitFor(confirmed('alice'));
    expect(await remaining()).toBe(before - 1);
  });

  it('is idempotent — processing the same job twice writes one order, one decrement', async () => {
    const proc = app.get(FulfillmentProcessor);
    const before = await remaining();
    const job = { data: { saleId, userId: 'idem' } } as Job<FulfillmentJob>;

    await proc.process(job);
    await proc.process(job);

    expect(
      await prisma.order.count({ where: { saleId, userId: 'idem' } }),
    ).toBe(1);
    expect(await remaining()).toBe(before - 1);
  });

  it('reconcile backfills a reservation whose fulfillment job was lost', async () => {
    const before = await remaining();

    // reserve directly (redis) but skip the enqueue → simulates a lost job
    expect(await reservation.reserve(saleId, 'bob')).toBe('success');
    expect((await confirmed('bob')())).toBe(false);

    const result = await sale.reconcile();
    expect(result.enqueued).toBeGreaterThanOrEqual(1);

    await waitFor(confirmed('bob'));
    expect(await remaining()).toBe(before - 1);
  });
});
