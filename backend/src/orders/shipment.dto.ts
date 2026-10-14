import { IsString } from 'class-validator';

export class BookOrderShipmentDto {
  @IsString()
  courierAccountId!: string;
}
