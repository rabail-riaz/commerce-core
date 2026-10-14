import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class IntegrationCredentialsDto {
  @IsObject()
  credentials!: Record<string, unknown>;
}

export class CreateIntegrationDto {
  @IsIn(['WOOCOMMERCE', 'SHOPIFY'])
  provider!: string;

  @IsOptional()
  @IsString()
  storeId?: string;
}
