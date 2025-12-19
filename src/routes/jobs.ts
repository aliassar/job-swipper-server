import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { jobService } from '../services/job.service';
import { formatResponse, parseIntSafe, sanitizeSearchInput, validateSalaryRange } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { validateUuidParam } from '../middleware/validate-params';
import { logger } from '../middleware/logger';

const jobs = new Hono<AppContext>();

// Validation schemas
const reportJobSchema = z.object({
  reason: z.enum(['fake', 'not_interested', 'dont_recommend_company']),
  details: z.string().optional(),
});

const acceptJobSchema = z.object({
  automaticApply: z.boolean().optional(),
});

/**
 * GET /api/jobs - Get pending jobs with optional filters
 * 
 * Query parameters:
 * @param search - Optional search term (job title, company, etc.)
 * @param page - Page number for pagination (default: 1)
 * @param limit - Number of results to return (default: 20)
 * @param location - Filter by location
 * @param salaryMin - Minimum salary filter
 * @param salaryMax - Maximum salary filter
 * 
 * @returns Array of pending jobs with pagination info
 * @throws 400 - If salaryMin > salaryMax
 */
jobs.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const search = sanitizeSearchInput(c.req.query('search'));
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const offset = (page - 1) * limit;
  const location = sanitizeSearchInput(c.req.query('location'));
  const salaryMin = c.req.query('salaryMin') ? parseIntSafe(c.req.query('salaryMin')!, 0) : undefined;
  const salaryMax = c.req.query('salaryMax') ? parseIntSafe(c.req.query('salaryMax')!, 0) : undefined;

  // Validate salary range
  const validation = validateSalaryRange(salaryMin, salaryMax);
  if (!validation.valid) {
    throw new ValidationError(validation.error!);
  }

  const result = await jobService.getPendingJobs(auth.userId, search, limit, location, salaryMin, salaryMax, offset);

  // Add pagination metadata
  const response = {
    ...result,
    pagination: {
      page,
      limit,
      hasMore: result.jobs.length === limit,
    }
  };

  return c.json(formatResponse(true, response, null, requestId));
});

/**
 * GET /api/jobs/filters - Get filter options
 * 
 * @returns List of blocked companies for the authenticated user
 */
jobs.get('/filters', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const blockedCompanies = await jobService.getBlockedCompanies(auth.userId);

  return c.json(formatResponse(true, {
    blockedCompanies: blockedCompanies.map(b => ({
      company: b.companyName,
      reason: b.reason,
      blockedAt: b.createdAt,
    })),
  }, null, requestId));
});

/**
 * GET /api/jobs/skipped - Get skipped jobs
 * 
 * Query parameters:
 * @param page - Page number (default: 1)
 * @param limit - Results per page (default: 20)
 * @param search - Optional search term
 * 
 * @returns Paginated list of skipped jobs
 */
jobs.get('/skipped', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = sanitizeSearchInput(c.req.query('search'));

  const result = await jobService.getSkippedJobs(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

/**
 * POST /api/jobs/:id/accept - Accept a job
 * 
 * @param id - Job UUID
 * 
 * Request body (optional):
 * @param automaticApply - Whether to automatically apply to the job
 * 
 * @returns Updated job with accepted status
 * @throws 400 - If job ID is invalid or request body is invalid
 * @throws 404 - If job not found
 */
jobs.post('/:id/accept', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  let metadata: { automaticApply?: boolean } | undefined;

  // Parse optional request body
  try {
    const body = await c.req.json();
    const validated = acceptJobSchema.safeParse(body);

    if (!validated.success) {
      throw new ValidationError('Invalid request body', validated.error.errors);
    }

    metadata = validated.data;
  } catch (error) {
    // If body is empty or invalid JSON, metadata remains undefined
    if (error instanceof ValidationError) {
      throw error;
    }
    // Log JSON parse errors for debugging
    if (error instanceof SyntaxError) {
      logger.debug({ error: error.message, jobId, userId: auth.userId }, 'Malformed JSON in accept job request body');
    }
    // For empty body or JSON parse errors, use undefined metadata
    metadata = undefined;
  }

  const job = await jobService.acceptJob(auth.userId, jobId, requestId, metadata);

  return c.json(formatResponse(true, job, null, requestId));
});

/**
 * POST /api/jobs/:id/reject - Reject a job
 * 
 * @param id - Job UUID
 * 
 * @returns Updated job with rejected status
 * @throws 400 - If job ID is invalid
 * @throws 404 - If job not found
 */
jobs.post('/:id/reject', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.updateJobStatus(auth.userId, jobId, 'rejected', 'rejected');

  return c.json(formatResponse(true, job, null, requestId));
});

/**
 * POST /api/jobs/:id/skip - Skip a job
 * 
 * @param id - Job UUID
 * 
 * @returns Updated job with skipped status
 * @throws 400 - If job ID is invalid
 * @throws 404 - If job not found
 */
jobs.post('/:id/skip', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.updateJobStatus(auth.userId, jobId, 'skipped', 'skipped');

  return c.json(formatResponse(true, job, null, requestId));
});

/**
 * POST /api/jobs/:id/save - Toggle save status
 * 
 * @param id - Job UUID
 * 
 * @returns Updated job with toggled save status
 * @throws 400 - If job ID is invalid
 * @throws 404 - If job not found
 */
jobs.post('/:id/save', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.toggleSave(auth.userId, jobId);

  return c.json(formatResponse(true, job, null, requestId));
});

/**
 * DELETE /api/jobs/:id/save - Unsave a job
 * 
 * @param id - Job UUID
 * 
 * @returns Updated job with unsaved status
 * @throws 400 - If job ID is invalid
 * @throws 404 - If job not found
 */
jobs.delete('/:id/save', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const job = await jobService.unsave(auth.userId, jobId);

  return c.json(formatResponse(true, job, null, requestId));
});

/**
 * POST /api/jobs/:id/rollback - Rollback decision
 * 
 * @param id - Job UUID
 * 
 * @returns Result with previous and new job status
 * @throws 400 - If job ID is invalid or rollback not possible
 * @throws 404 - If job not found
 */
jobs.post('/:id/rollback', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const result = await jobService.rollbackJob(auth.userId, jobId);

  return c.json(formatResponse(true, result, null, requestId));
});

/**
 * POST /api/jobs/:id/report - Report a job
 * 
 * @param id - Job UUID
 * 
 * Request body:
 * @param reason - Report reason ('fake', 'not_interested', 'dont_recommend_company')
 * @param details - Optional additional details
 * 
 * @returns Created report record
 * @throws 400 - If job ID is invalid or request body is invalid
 * @throws 404 - If job not found
 */
jobs.post('/:id/report', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const body = await c.req.json();
  const validated = reportJobSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const report = await jobService.reportJob(
    auth.userId,
    jobId,
    validated.data.reason,
    validated.data.details
  );

  return c.json(formatResponse(true, report, null, requestId));
});

/**
 * POST /api/jobs/:id/unreport - Remove report
 * 
 * @param id - Job UUID
 * 
 * @returns Success message
 * @throws 400 - If job ID is invalid
 * @throws 404 - If job or report not found
 */
jobs.post('/:id/unreport', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  await jobService.unreportJob(auth.userId, jobId);

  return c.json(
    formatResponse(true, { message: 'Report removed successfully' }, null, requestId)
  );
});

export default jobs;
