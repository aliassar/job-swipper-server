import { Hono } from 'hono';
import { AppContext } from '../types';
import { authMiddleware } from '../middleware/auth';
import { adminAuthMiddleware } from '../middleware/admin-auth';
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

// All other routes require authentication
api.use('/jobs/*', authMiddleware);
api.use('/applications/*', authMiddleware);
api.use('/application-history/*', authMiddleware);
api.use('/saved/*', authMiddleware);
api.use('/reported/*', authMiddleware);
api.use('/history/*', authMiddleware);
api.use('/settings/*', authMiddleware);
api.use('/resumes/*', authMiddleware);
api.use('/cover-letters/*', authMiddleware);
api.use('/generated/*', authMiddleware);
api.use('/email/*', authMiddleware);
api.use('/email-connections/*', authMiddleware);
api.use('/users/*', authMiddleware);
api.use('/user-profile/*', authMiddleware);
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
