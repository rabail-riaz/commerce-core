import { IsIn, IsObject, IsOptional, IsString, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WooCommerceCredentialsDto {
  [key: string]: unknown;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @IsString()
  key!: string;

  @IsString()
  secret!: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class IntegrationCredentialsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => WooCommerceCredentialsDto)
  credentials!: WooCommerceCredentialsDto;
}

export class CreateIntegrationDto {
  @IsIn(['WOOCOMMERCE'])
  provider!: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
