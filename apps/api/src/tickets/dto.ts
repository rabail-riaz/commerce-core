import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { PaginationDto } from '../common/pagination.dto';

export class TicketQueryDto extends PaginationDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
}

export class CreateTicketDto {
  @IsString() @MinLength(3) subject!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() emailThreadId?: string;
  @IsOptional() @IsString() whatsappConversationId?: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsEnum(TicketStatus) status?: TicketStatus;
  @IsOptional() @IsEnum(TicketPriority) priority?: TicketPriority;
  @IsOptional() @IsString() assigneeId?: string | null;
  @IsOptional() @IsString() customerId?: string | null;
  @IsOptional() @IsString() orderId?: string | null;
  @IsOptional() @IsString() emailThreadId?: string | null;
  @IsOptional() @IsString() whatsappConversationId?: string | null;
}

export class TicketMessageDto {
  @IsString() @MinLength(1) body!: string;
}
