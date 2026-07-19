import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PurchaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  userId!: string;
}
