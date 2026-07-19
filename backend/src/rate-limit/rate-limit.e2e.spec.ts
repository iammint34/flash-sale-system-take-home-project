import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationService } from '../reservation/reservation.service';
import { RateLimitConfigService } from './rate-limit-config.service';

// throttler tracks per client IP; each test uses a unique remoteAddress so its
// counter is isolated from every other suite (which use 127.0.0.1).
describe('Rate limiting', () => {
  let app: NestFastifyApplication;
  let rl: RateLimitConfigService;

  const hit = (ip: string) =>
    app
      .inject({ method: 'GET', url: '/sale/status', remoteAddress: ip })
      .then((r) => r.statusCode);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    rl = app.get(RateLimitConfigService);

    // a sale must exist for /sale/status to return 200
    const prisma = app.get(PrismaService);
    const reservation = app.get(ReservationService);
    await prisma.order.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.product.deleteMany();
    const product = await prisma.product.create({ data: { name: 'rl' } });
    const sale = await prisma.sale.create({
      data: {
        productId: product.id,
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 3_600_000),
        totalStock: 10,
        inventory: { create: { remaining: 10 } },
      },
    });
    await reservation.resetStock(sale.id, 10);
  });

  afterAll(async () => {
    await rl.update({ enabled: false });
    await app.close();
  });

  it('allows up to the limit then returns 429', async () => {
    await rl.update({ enabled: true, ttl: 60, max: 3 });
    const ip = '203.0.113.10';

    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push(await hit(ip));

    expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
    expect(codes[3]).toBe(429);
  });

  it('kill-switch frees even an already-blocked client', async () => {
    const ip = '203.0.113.30';
    await rl.update({ enabled: true, ttl: 60, max: 1 });

    expect(await hit(ip)).toBe(200);
    expect(await hit(ip)).toBe(429); // now blocked within the window

    await rl.update({ enabled: false });
    expect(await hit(ip)).toBe(200); // bypassed despite the existing block
  });
});
