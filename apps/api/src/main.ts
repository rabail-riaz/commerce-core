import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

function corsOrigins() {
  const configured = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const aliases = configured.flatMap((origin) => {
    if (origin.includes('localhost')) return [origin.replaceAll('localhost', '127.0.0.1')];
    if (origin.includes('127.0.0.1')) return [origin.replaceAll('127.0.0.1', 'localhost')];
    return [];
  });
  return [...new Set([...configured, ...aliases])];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: corsOrigins(), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Commerce Core API').setVersion('v1').addBearerAuth().build());
    SwaggerModule.setup('docs', app, document);
  }
  await app.listen(Number(process.env.PORT ?? 3001));
}
bootstrap();
