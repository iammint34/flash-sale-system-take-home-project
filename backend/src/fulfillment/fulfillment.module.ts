import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FULFILLMENT_QUEUE } from './fulfillment.constants';
import { FulfillmentProcessor } from './fulfillment.processor';
import { FulfillmentService } from './fulfillment.service';

@Module({
  imports: [BullModule.registerQueue({ name: FULFILLMENT_QUEUE })],
  providers: [FulfillmentService, FulfillmentProcessor],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
