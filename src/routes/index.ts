import { Hono } from 'hono';
import { AppContext } from '../types';
import { authMiddleware } from '../middleware/auth';
import { adminAuthMiddleware } from '../middleware/admin-auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import auth from './auth';
import jobs from './jobs';
import applications from './applications';
import saved from './saved';
import reported from './reported';
import history from './history';
import settings from './settings';
import resumes from './resumes';
import coverLetters from './cover-letters';
import generation from './generation';
import emailSync from './email-sync';
import users from './users';
import sync from './sync';
import notifications from './notifications';
import webhooks from './webhooks';
import emailConnections from './email-connections';
import userProfile from './user-profile';
import applicationHistory from './application-history';
import admin from './admin';

const api = new Hono<AppContext>();

/**
 * Thread-safe health check cache for serverless environments
 * Prevents concurrent database checks using a pending promise pattern
 */
class HealthCheckCache {
  private cache: {
    status: string;
    lastCheck: number;
    dbStatus: string;
    dbError?: string;
  } | null = null;

  private pendingCheck: Promise<{
    status: string;
    lastCheck: number;
    dbStatus: string;
    dbError?: string;
    cached: boolean;
  }> | null = null;

  /**
   * Get cached health check or perform a new check
   * @param ttl - Time to live for cache in milliseconds
   * @param checker - Function to perform health check
   * @returns Health check result with cached flag
   */
  async getOrRefresh(
    ttl: number,
    checker: () => Promise<{
      status: string;
      lastCheck: number;
      dbStatus: string;
      dbError?: string;
    }>
  ) {
    const now = Date.now();

    // Return cached result if available and fresh
    if (this.cache && now - this.cache.lastCheck < ttl) {
      return { ...this.cache, cached: true };
    }

    // If a check is already pending, wait for it
    if (this.pendingCheck) {
      return this.pendingCheck;
    }

    // Start a new check
    this.pendingCheck = checker()
      .then((result) => {
        this.cache = result;
        return { ...result, cached: false };
      })
      .finally(() => {
        this.pendingCheck = null;
      });

    return this.pendingCheck;
  }
}

const healthCheckCache = new HealthCheckCache();
const HEALTH_CHECK_CACHE_TTL = 30000; // 30 seconds

/**
 * GET /health - Health check endpoint
 * 
 * Performs a database connectivity check with caching to reduce load.
 * Cache is thread-safe for serverless environments.
 * 
 * @returns Health status with database connectivity info
 */
api.get('/health', async (c) => {
  const requestId = c.get('requestId');

  const result = await healthCheckCache.getOrRefresh(
    HEALTH_CHECK_CACHE_TTL,
    async () => {
      // Perform actual database check
      const { db } = await import('../lib/db');
      const { sql } = await import('drizzle-orm');

      let dbStatus = 'healthy';
      let dbError = undefined;

      try {
        await db.execute(sql`SELECT 1`);
      } catch (error) {
        dbStatus = 'unhealthy';
        dbError = error instanceof Error ? error.message : 'Unknown database error';
      }

      return {
        status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
        lastCheck: Date.now(),
        dbStatus,
        dbError,
      };
    }
  );

  const isHealthy = result.dbStatus === 'healthy';

  return c.json(
    {
      success: isHealthy,
      data: {
        status: result.status,
        timestamp: new Date().toISOString(),
        database: result.dbStatus,
        cached: result.cached,
        ...(result.dbError && { dbError: result.dbError }),
      },
      error: null,
      requestId,
    },
    isHealthy ? 200 : 503
  );
});

// Sync endpoint (no auth required for cron)
api.route('/sync', sync);

// Admin endpoints (protected by admin authentication)
api.use('/admin/*', adminAuthMiddleware);
api.route('/admin', admin);

// Auth endpoints (no auth required)
api.route('/auth', auth);

// Webhook endpoints (no auth required - use custom auth middleware)
api.route('/webhooks', webhooks);

// SSE stream endpoint (custom auth via query param since EventSource doesn't support headers)
// Must be mounted BEFORE auth middleware is applied to /notifications/*
api.get('/notifications/stream', async (c) => {
  const { stream } = await import('hono/streaming');
  const { notificationService } = await import('../services/notification.service');
  const { authService } = await import('../services/auth.service');

  // Get token from query param (EventSource can't send Authorization header)
  const token = c.req.query('token');
  if (!token) {
    return c.json({ error: 'Token required' }, 401);
  }

  let userId: string;
  try {
    const user = authService.verifyToken(token);
    userId = user.id;
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }

  // Set SSE headers
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no');

  return stream(c, async (stream) => {
    // Send initial connection with unread count
    const unreadCount = await notificationService.getUnreadCount(userId);
    await stream.writeln(`data: ${JSON.stringify({ type: 'connected', unreadCount })}\n`);

    // Subscribe to notifications
    const unsubscribe = notificationService.subscribeToNotifications(
      userId,
      async (notification) => {
        try {
          await stream.writeln(`data: ${JSON.stringify(notification)}\n`);
        } catch (error) {
          // Stream may be closed, ignore error
        }
      }
    );

    // Heartbeat
    const heartbeat = setInterval(async () => {
      try { await stream.writeln(': heartbeat\n'); }
      catch {
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 30000);

    // Create a promise that resolves when the stream is aborted
    // This keeps the stream open until the client disconnects
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        unsubscribe();
        resolve();
      });
    });
  });
});

// All other routes require authentication
// Note: Apply middleware to both root routes AND wildcard patterns
// Wildcard patterns like '/jobs/*' only match nested routes, not the root route
api.use('/jobs', authMiddleware);
api.use('/jobs/*', authMiddleware);
api.use('/jobs/*', idempotencyMiddleware); // Accept, reject, skip, save, rollback actions need idempotency
api.use('/applications', authMiddleware);
api.use('/applications/*', authMiddleware);
api.use('/applications/*', idempotencyMiddleware); // Stage updates need idempotency
api.use('/application-history', authMiddleware);
api.use('/application-history/*', authMiddleware);
api.use('/saved', authMiddleware);
api.use('/saved/*', authMiddleware);
api.use('/reported', authMiddleware);
api.use('/reported/*', authMiddleware);
api.use('/history', authMiddleware);
api.use('/history/*', authMiddleware);
api.use('/settings', authMiddleware);
api.use('/settings/*', authMiddleware);
api.use('/settings/*', idempotencyMiddleware); // Settings updates need idempotency
api.use('/resumes', authMiddleware);
api.use('/resumes/*', authMiddleware);
api.use('/cover-letters', authMiddleware);
api.use('/cover-letters/*', authMiddleware);
api.use('/generated/*', authMiddleware);
api.use('/email', authMiddleware);
api.use('/email/*', authMiddleware);
api.use('/email-connections', authMiddleware);
api.use('/email-connections/*', authMiddleware);
api.use('/users', authMiddleware);
api.use('/users/*', authMiddleware);
api.use('/user-profile', authMiddleware);
api.use('/user-profile/*', authMiddleware);
api.use('/notifications', authMiddleware);
api.use('/notifications/*', authMiddleware);

// Mount routes
api.route('/jobs', jobs);
api.route('/applications', applications);
api.route('/application-history', applicationHistory);
api.route('/saved', saved);
api.route('/reported', reported);
api.route('/history', history);
api.route('/settings', settings);
api.route('/resumes', resumes);
api.route('/cover-letters', coverLetters);
api.route('/', generation); // Generation routes are mounted at root for /jobs/:id/generate/*
api.route('/email', emailSync);
api.route('/email-connections', emailConnections);
api.route('/users', users);
api.route('/user-profile', userProfile);
api.route('/notifications', notifications);

export default api;
