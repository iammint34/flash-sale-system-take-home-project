import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ReservationService } from '../reservation/reservation.service';
import { SALE_CHANGED_CHANNEL } from './sale.constants';
import { SaleStatus, saleStatus } from './sale-status';

type SaleRow = Prisma.SaleGetPayload<{ include: { inventory: true } }>;

export type PurchaseResult =
  | 'success'
  | 'already_purchased'
  | 'sold_out'
  | 'not_active';

@Injectable()
export class SaleService implements OnModuleInit, OnModuleDestroy {
  // the sale window/total is static during a run, so cache the row and
  // invalidate on admin updates — keeps status polling off postgres.
  // invalidation is broadcast via redis pub/sub so every instance stays coherent.
  private cached: SaleRow | null = null;
  private sub?: Redis;
  private readonly log = new Logger(SaleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservation: ReservationService,
    private readonly fulfillment: FulfillmentService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    this.sub = this.redis.duplicate();
    await this.sub.subscribe(SALE_CHANGED_CHANNEL);
    this.sub.on('message', () => {
      this.cached = null; // re-read from postgres on the next request
    });
  }

  onModuleDestroy() {
    this.sub?.disconnect();
  }

  async status() {
    const sale = await this.current();
    return {
      status: saleStatus(new Date(), sale.startTime, sale.endTime),
      startTime: sale.startTime,
      endTime: sale.endTime,
      totalStock: sale.totalStock,
      remaining: await this.reservation.getRemaining(sale.id),
    };
  }

  async purchase(userId: string): Promise<{ result: PurchaseResult }> {
    const sale = await this.current();

    const state = saleStatus(new Date(), sale.startTime, sale.endTime);
    if (state !== 'active') return { result: 'not_active' };

    const result = await this.reservation.reserve(sale.id, userId);
    if (result === 'success') {
      // the reservation is the user's win; if durable enqueue fails, don't fail
      // the request — reconciliation (M4) backfills the order from the buyers set
      try {
        await this.fulfillment.enqueue(sale.id, userId);
      } catch (err) {
        this.log.error(
          `enqueue failed for ${sale.id}/${userId}: ${(err as Error).message}`,
        );
      }
    }
    return { result };
  }

  async purchaseStatus(
    userId: string,
  ): Promise<{ status: 'none' | 'reserved' | 'confirmed' }> {
    const sale = await this.current();

    const order = await this.prisma.order.findUnique({
      where: { saleId_userId: { saleId: sale.id, userId } },
    });
    if (order?.status === 'confirmed') return { status: 'confirmed' };

    // reserved in redis but not yet written by the worker → still "reserved"
    if (order || (await this.reservation.hasReserved(sale.id, userId))) {
      return { status: 'reserved' };
    }
    return { status: 'none' };
  }

  // one admin mutation for sale config: window and/or stock. re-totalling stock
  // goes through the same redis+postgres path as before (respects already-reserved).
  async updateSale(patch: {
    startTime?: string;
    endTime?: string;
    totalStock?: number;
  }) {
    const sale = await this.current();

    // resolve the effective window (untouched fields keep their current value)
    const start = patch.startTime ? new Date(patch.startTime) : sale.startTime;
    const end = patch.endTime ? new Date(patch.endTime) : sale.endTime;
    if (start >= end) {
      throw new BadRequestException('startTime must be before endTime');
    }

    const data: Prisma.SaleUpdateInput = { startTime: start, endTime: end };
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    if (patch.totalStock != null) {
      const remaining = await this.reservation.applyStockTotal(
        sale.id,
        patch.totalStock,
      );
      data.totalStock = patch.totalStock;
      ops.push(
        this.prisma.inventory.update({
          where: { saleId: sale.id },
          data: { remaining },
        }),
      );
    }
    ops.push(this.prisma.sale.update({ where: { id: sale.id }, data }));
    await this.prisma.$transaction(ops);

    this.cached = null;
    await this.redis.publish(SALE_CHANGED_CHANNEL, '1'); // invalidate other instances
    return this.status();
  }

  // backfill orders for anyone who reserved in redis but whose fulfillment job
  // was lost (e.g. enqueue failed). idempotent — re-enqueues only the missing.
  async reconcile(): Promise<{ checked: number; enqueued: number }> {
    const sale = await this.current();
    const buyers = await this.reservation.getBuyers(sale.id);
    if (buyers.length === 0) return { checked: 0, enqueued: 0 };

    const orders = await this.prisma.order.findMany({
      where: { saleId: sale.id, userId: { in: buyers } },
      select: { userId: true },
    });
    const persisted = new Set(orders.map((o) => o.userId));
    const missing = buyers.filter((u) => !persisted.has(u));

    for (const userId of missing) {
      await this.fulfillment.enqueue(sale.id, userId);
    }
    return { checked: buyers.length, enqueued: missing.length };
  }

  private async current(): Promise<SaleRow> {
    if (!this.cached) {
      this.cached = await this.prisma.sale.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { inventory: true },
      });
    }
    if (!this.cached) throw new NotFoundException('no sale configured');
    return this.cached;
  }
}

export type { SaleStatus };
