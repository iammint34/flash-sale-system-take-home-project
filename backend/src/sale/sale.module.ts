import { Module } from '@nestjs/common';
import { AdminController } from '../admin/admin.controller';
import { AdminGuard } from '../admin/admin.guard';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { ReservationModule } from '../reservation/reservation.module';
import { SaleController } from './sale.controller';
import { SaleService } from './sale.service';

@Module({
  imports: [ReservationModule, FulfillmentModule],
  controllers: [SaleController, AdminController],
  providers: [SaleService, AdminGuard],
})
export class SaleModule {}
