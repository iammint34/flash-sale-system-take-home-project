import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  FULFILLMENT_QUEUE,
  FulfillmentJob,
} from './fulfillment.constants';

// turns a redis reservation into a durable order. runs off the hot path; safe to
// retry and safe to run on every instance (the inventory row serializes writers).
@Processor(FULFILLMENT_QUEUE, { concurrency: 5 })
export class FulfillmentProcessor extends WorkerHost {
  private readonly log = new Logger(FulfillmentProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<FulfillmentJob>): Promise<void> {
    const { saleId, userId } = job.data;

    await this.prisma.$transaction(async (tx) => {
      // already persisted → nothing to do (retry / reconcile re-run)
      const existing = await tx.order.findUnique({
        where: { saleId_userId: { saleId, userId } },
      });
      if (existing) return;

      // claim a durable unit under the cap; ties the decrement to the insert so a
      // retry can't decrement twice. 0 rows = redis handed out past the durable
      // stock (only possible after a redis-loss incident) → don't fabricate stock.
      const claimed = await tx.$executeRaw`
        UPDATE inventory SET remaining = remaining - 1
        WHERE sale_id = ${saleId} AND remaining > 0`;
      if (claimed === 0) {
        this.log.error(
          `durable stock exhausted; cannot fulfill ${saleId}/${userId}`,
        );
        return;
      }

      await tx.order.create({
        data: { saleId, userId, status: 'confirmed' },
      });
    });
  }
}
