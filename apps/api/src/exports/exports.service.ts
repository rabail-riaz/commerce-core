import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService, ReportQueryDto } from '../reports/reports.service';

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService, private readonly reports: ReportsService) {}

  async csv(tenantId: string, type: 'orders' | 'customers' | 'shipments' | 'returns' | 'reports', query: ReportQueryDto = {}) {
    if (type === 'reports') {
      const report = await this.reports.summary(tenantId, query);
      return this.toCsv(['metric', 'value'], Object.entries(report).map(([metric, value]) => ({ metric, value: typeof value === 'object' ? JSON.stringify(value) : value })));
    }
    const createdAt = { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) };
    const scope = Object.keys(createdAt).length ? { createdAt } : {};
    if (type === 'orders') {
      const rows = await this.prisma.order.findMany({ where: { tenantId, ...(query.storeId ? { storeId: query.storeId } : {}), ...scope }, orderBy: { createdAt: 'desc' } });
      return this.toCsv(['id', 'externalOrderId', 'status', 'totalAmount', 'currency', 'createdAt'], rows);
    }
    if (type === 'customers') {
      const rows = await this.prisma.customer.findMany({ where: { tenantId, ...scope }, orderBy: { createdAt: 'desc' } });
      return this.toCsv(['id', 'email', 'firstName', 'lastName', 'phone', 'status', 'createdAt'], rows);
    }
    if (type === 'shipments') {
      const rows = await this.prisma.shipment.findMany({ where: { tenantId, ...scope }, orderBy: { createdAt: 'desc' } });
      return this.toCsv(['id', 'orderId', 'trackingNumber', 'status', 'createdAt'], rows);
    }
    const rows = await this.prisma.return.findMany({ where: { tenantId, ...scope }, orderBy: { createdAt: 'desc' } });
    return this.toCsv(['id', 'orderId', 'status', 'reason', 'createdAt'], rows);
  }

  private toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
    const lines = [headers.join(','), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(','))];
    return lines.join('\n');
  }
}
