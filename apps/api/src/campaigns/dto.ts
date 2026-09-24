import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CampaignStatus, TemplateChannel } from '@prisma/client';

export class CreateTemplateDto {
  @IsString() @MinLength(2) name!: string;
  @IsEnum(TemplateChannel) channel!: TemplateChannel;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() subject?: string;
  @IsString() body!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCampaignDto {
  @IsString() @MinLength(2) name!: string;
  @IsEnum(TemplateChannel) channel!: TemplateChannel;
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() audience?: Record<string, unknown>;
  @IsOptional() @IsString() scheduledAt?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @IsOptional() @IsString() scheduledAt?: string;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RenderTemplateDto {
  variables!: Record<string, string>;
}
