import { Hono } from 'hono';
import { AppContext } from '../types';
import { authMiddleware } from '../middleware/auth';
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

// Health check (no auth required)
api.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// Sync endpoint (no auth required for cron)
api.route('/sync', sync);

// Admin endpoints (no auth required - should be protected by network rules in production)
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
