import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { jobService } from '../services/job.service';
import { formatResponse, parseIntSafe } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { db } from '../lib/db';
import { reportedJobs } from '../db/schema';
import { and, eq } from 'drizzle-orm';

const jobs = new Hono<AppContext>();

// Validation schemas
const reportJobSchema = z.object({
  reason: z.enum(['fake', 'not_interested', 'dont_recommend_company']),
  details: z.string().optional(),
});

// GET /api/jobs - Get pending jobs
jobs.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const search = c.req.query('search');
  const limit = parseIntSafe(c.req.query('limit'), 10);

  const jobList = await jobService.getPendingJobs(auth.userId, search, limit);

  return c.json(formatResponse(true, jobList, null, requestId));
});

// GET /api/jobs/skipped - Get skipped jobs
jobs.get('/skipped', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = c.req.query('search');

  const result = await jobService.getSkippedJobs(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

// POST /api/jobs/:id/accept - Accept a job
jobs.post('/:id/accept', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.acceptJob(auth.userId, jobId, requestId);

  return c.json(formatResponse(true, job, null, requestId));
});

// POST /api/jobs/:id/reject - Reject a job
jobs.post('/:id/reject', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.updateJobStatus(auth.userId, jobId, 'rejected', 'rejected');

  return c.json(formatResponse(true, job, null, requestId));
});

// POST /api/jobs/:id/skip - Skip a job
jobs.post('/:id/skip', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.updateJobStatus(auth.userId, jobId, 'skipped', 'skipped');

  return c.json(formatResponse(true, job, null, requestId));
});

// POST /api/jobs/:id/save - Toggle save status
jobs.post('/:id/save', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.toggleSave(auth.userId, jobId);

  return c.json(formatResponse(true, job, null, requestId));
});

// DELETE /api/jobs/:id/save - Unsave a job
jobs.delete('/:id/save', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.unsave(auth.userId, jobId);

  return c.json(formatResponse(true, job, null, requestId));
});

// POST /api/jobs/:id/rollback - Rollback decision
jobs.post('/:id/rollback', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.updateJobStatus(auth.userId, jobId, 'pending', 'rollback');

  return c.json(formatResponse(true, job, null, requestId));
});

// POST /api/jobs/:id/report - Report a job
jobs.post('/:id/report', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const body = await c.req.json();
  const validated = reportJobSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  // Check if job exists
  await jobService.getJobWithStatus(auth.userId, jobId);

  // Check if already reported
  const existing = await db
    .select()
    .from(reportedJobs)
    .where(and(eq(reportedJobs.userId, auth.userId), eq(reportedJobs.jobId, jobId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(reportedJobs).values({
      userId: auth.userId,
      jobId,
      reason: validated.data.reason,
      details: validated.data.details,
    });
  }

  return c.json(
    formatResponse(true, { message: 'Job reported successfully' }, null, requestId)
  );
});

// POST /api/jobs/:id/unreport - Remove report
jobs.post('/:id/unreport', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  await db
    .delete(reportedJobs)
    .where(and(eq(reportedJobs.userId, auth.userId), eq(reportedJobs.jobId, jobId)));

  return c.json(
    formatResponse(true, { message: 'Report removed successfully' }, null, requestId)
  );
});

export default jobs;
