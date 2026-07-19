import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PurchaseDto } from './dto/purchase.dto';
import { SaleService } from './sale.service';

@Controller('sale')
export class SaleController {
  constructor(private readonly sale: SaleService) {}

  @Get('status')
  status() {
    return this.sale.status();
  }

  @Post('purchase')
  purchase(@Body() dto: PurchaseDto) {
    return this.sale.purchase(dto.userId);
  }

  @Get('purchase/:userId')
  purchaseStatus(@Param('userId') userId: string) {
    return this.sale.purchaseStatus(userId);
  }
}
