import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { RateLimitConfigService } from '../rate-limit/rate-limit-config.service';
import { SaleService } from '../sale/sale.service';
import { AdminGuard } from './admin.guard';
import { UpdateRateLimitDto } from './dto/update-rate-limit.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';

@Controller('admin/sale')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly sale: SaleService,
    private readonly rateLimit: RateLimitConfigService,
  ) {}

  // single mutation for sale config — window and/or stock
  @Patch()
  updateSale(@Body() dto: UpdateSaleDto) {
    return this.sale.updateSale(dto);
  }

  @Post('reconcile')
  reconcile() {
    return this.sale.reconcile();
  }

  @Get('rate-limit')
  rateLimitConfig() {
    return this.rateLimit.current();
  }

  @Patch('rate-limit')
  updateRateLimit(@Body() dto: UpdateRateLimitDto) {
    return this.rateLimit.update(dto);
  }
}
