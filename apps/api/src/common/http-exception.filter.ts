import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = typeof exceptionResponse === 'object' && exceptionResponse !== null ? exceptionResponse as Record<string, unknown> : { message: exceptionResponse ?? 'Internal server error' };
    const message = payload.message ?? 'Internal server error';
    const requestId = request.headers['x-request-id']?.toString() ?? request.id?.toString();

    response.status(status).json({
      error: {
        code: payload.error ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
        message,
        details: payload.details ?? null,
        requestId,
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
