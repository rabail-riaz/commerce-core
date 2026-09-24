import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const windows = new Map<string, { count: number; resetAt: number }>();

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const key = `${req.ip}:${req.path.startsWith('/api/v1/auth') ? 'auth' : 'api'}`;
    const limit = key.endsWith('auth') ? 30 : 300;
    const now = Date.now();
    const current = windows.get(key);
    if (!current || current.resetAt < now) {
      windows.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    current.count += 1;
    if (current.count > limit) {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests', requestId: req.headers['x-request-id'] } });
      return;
    }
    next();
  }
}
