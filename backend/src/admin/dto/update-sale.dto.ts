import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

// every field optional — the admin console may tweak the window, the stock, or
// both in one save. cross-field (start < end) is checked in the service since it
// depends on the current sale for the fields left untouched.
export class UpdateSaleDto {
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalStock?: number;
}
