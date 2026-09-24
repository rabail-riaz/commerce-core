import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { EmailAccountStatus, EmailProvider } from '@prisma/client';

export class CreateEmailAccountDto {
  @IsEmail()
  emailAddress!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsEnum(EmailProvider)
  provider!: EmailProvider;

  @IsOptional()
  @IsString()
  credentialsReference?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  canSend?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceive?: boolean;
}

export class SaveEmailCredentialsDto {
  credentials!: Record<string, unknown>;
}

export class UpdateEmailAccountDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEnum(EmailAccountStatus)
  status?: EmailAccountStatus;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  canSend?: boolean;

  @IsOptional()
  @IsBoolean()
  canReceive?: boolean;
}

export class IngestEmailMessageDto {
  @IsString()
  fromAddress!: string;

  @IsArray()
  @IsEmail({}, { each: true })
  toAddresses!: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  ccAddresses?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  textBody?: string;

  @IsOptional()
  @IsString()
  htmlBody?: string;

  @IsOptional()
  @IsString()
  providerMessageId?: string;

  @IsOptional()
  @IsString()
  threadId?: string;
}

export class ReplyEmailDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  senderAccountId?: string;
}

export class LinkEmailThreadDto {
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  orderId?: string | null;

  @IsOptional()
  @IsString()
  ticketId?: string | null;
}
