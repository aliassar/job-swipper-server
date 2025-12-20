import { Context, Next } from 'hono';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
});

export { logger };

export async function loggerMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  const requestId = c.get('requestId') || 'unknown';
  const path = c.req.path;

  // Skip logging for notification stream to reduce log spam
  const isStreamEndpoint = path.includes('/notifications/stream');

  if (!isStreamEndpoint) {
    logger.info({
      requestId,
      method: c.req.method,
      path,
      msg: 'Request started',
    });
  }

  await next();

  if (!isStreamEndpoint) {
    const duration = Date.now() - startTime;

    logger.info({
      requestId,
      method: c.req.method,
      path,
      status: c.res.status,
      duration,
      msg: 'Request completed',
    });
  }
}
