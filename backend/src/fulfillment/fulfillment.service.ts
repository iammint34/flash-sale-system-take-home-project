import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  FULFILLMENT_QUEUE,
  FulfillmentJob,
} from './fulfillment.constants';

@Injectable()
export class FulfillmentService {
  constructor(
    @InjectQueue(FULFILLMENT_QUEUE) private readonly queue: Queue<FulfillmentJob>,
  ) {}

  // stable per-winner jobId makes the enqueue idempotent — a retried purchase
  // can't produce a duplicate fulfillment job. base64url keeps it free of the
  // ':' bullmq forbids and safe for any userId.
  async enqueue(saleId: string, userId: string): Promise<void> {
    const jobId = `${saleId}_${Buffer.from(userId).toString('base64url')}`;
    await this.queue.add(
      'fulfill',
      { saleId, userId },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: 1000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
