import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/pagination.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, pagination: PaginationDto) {
    const skip = (pagination.page - 1) * pagination.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, skip, take: pagination.limit }),
      this.prisma.role.count({ where: { tenantId } }),
    ]);
    return { items, page: pagination.page, limit: pagination.limit, total };
  }
}
