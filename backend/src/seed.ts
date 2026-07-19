import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { RateLimitConfigService } from './rate-limit/rate-limit-config.service';
import { RedisService } from './redis/redis.service';
import { ReservationService } from './reservation/reservation.service';
import { SALE_CHANGED_CHANNEL } from './sale/sale.constants';

// resets the world to a single fresh sale derived from SALE_* config
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const reservation = app.get(ReservationService);
  const redis = app.get(RedisService);
  const cfg = app.get(ConfigService).getOrThrow<{
    productName: string;
    totalStock: number;
    startOffsetMinutes: number;
    durationMinutes: number;
  }>('sale');

  const now = new Date();
  const start = new Date(now.getTime() + cfg.startOffsetMinutes * 60_000);
  const end = new Date(start.getTime() + cfg.durationMinutes * 60_000);

  // wipe in FK-safe order, then recreate the single sale
  await prisma.order.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.product.deleteMany();

  // drop stale stock/buyers keys from previous seeds
  const stale = await redis.keys('sale:*');
  if (stale.length) await redis.del(...stale);

  const product = await prisma.product.create({
    data: { name: cfg.productName },
  });
  const sale = await prisma.sale.create({
    data: {
      productId: product.id,
      startTime: start,
      endTime: end,
      totalStock: cfg.totalStock,
      inventory: { create: { remaining: cfg.totalStock } },
    },
  });

  await reservation.resetStock(sale.id, cfg.totalStock);
  await app.get(RateLimitConfigService).resetToEnv();
  // if a cluster is already running, tell every instance to drop its stale sale
  await redis.publish(SALE_CHANGED_CHANNEL, '1');

  console.log(
    `seeded sale ${sale.id}: ${cfg.totalStock} units, ${start.toISOString()} → ${end.toISOString()}`,
  );
  await app.close();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
