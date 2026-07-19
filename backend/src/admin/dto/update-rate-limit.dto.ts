import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateRateLimitDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  ttl?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  max?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
