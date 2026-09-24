import {Controller, Get, ServiceUnavailableException} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';

@Controller()
export class HealthController {
    constructor(private prisma: PrismaService) {
    }

    @Get('/health') health() {
        return {status: 'ok', timestamp: new Date().toISOString()};
    }

    @Get('/health/database') async database() {
        try {
            await this.prisma.$queryRaw`SELECT 1`;
            return {status: 'ok'};
        } catch {
            throw new ServiceUnavailableException({status: 'down', dependency: 'database'});
        }
    }
}
