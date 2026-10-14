import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import Joi = require('joi');
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CommonModule } from './common/common.module';
import { OrdersModule } from './orders/orders.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { QueuesModule } from './queues/queues.module';
import { CouriersModule } from './couriers/couriers.module';
import { ShippingModule } from './shipping/shipping.module';
import { EmailModule } from './email/email.module';
import { TicketsModule } from './tickets/tickets.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AutomationsModule } from './automations/automations.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { InboxModule } from './inbox/inbox.module';
import { SaasModule } from './saas/saas.module';
import { ExportsModule } from './exports/exports.module';
import { AccountingModule } from './accounting/accounting.module';
import { RateLimitMiddleware } from './common/rate-limit.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: Joi.object({ DATABASE_URL: Joi.string().required(), REDIS_URL: Joi.string().uri().default('redis://localhost:6379'), JWT_ACCESS_SECRET: Joi.string().min(32).required(), JWT_REFRESH_SECRET: Joi.string().min(32).required(), INTEGRATION_ENCRYPTION_KEY: Joi.string().required(), PORT: Joi.number().default(3001), WEB_ORIGIN: Joi.string().required() }) }),
    LoggerModule.forRoot({ pinoHttp: { level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-wc-webhook-signature', 'req.body.password', 'req.body.refreshToken', 'req.body.credentials', 'req.body.secret', 'req.body.webhookSecret', 'res.body.accessToken', 'res.body.refreshToken'], genReqId: (req) => req.headers['x-request-id']?.toString() ?? crypto.randomUUID() } }),
    CommonModule, PrismaModule, AuthModule, TenantsModule, UsersModule, RolesModule, DashboardModule, IntegrationsModule, OrdersModule, CustomersModule, ProductsModule, CouriersModule, ShippingModule, EmailModule, TicketsModule, CampaignsModule, AutomationsModule, ReportsModule, NotificationsModule, WhatsAppModule, InboxModule, SaasModule, ExportsModule, AccountingModule, QueuesModule, HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
