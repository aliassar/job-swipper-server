import { Hono } from 'hono';
import { AppContext } from '../types';
import { salaryNormalizationService } from '../services/salary-normalization.service';
import { formatResponse } from '../lib/utils';

const admin = new Hono<AppContext>();

/**
 * POST /api/admin/normalize-salaries - Normalize all salary data
 * This endpoint processes all jobs and populates salaryMin/salaryMax fields
 * from the salary text field for efficient filtering
 */
admin.post('/normalize-salaries', async (c) => {
  const requestId = c.get('requestId');

  const result = await salaryNormalizationService.normalizeAllSalaries();

  return c.json(formatResponse(true, result, null, requestId));
});

/**
 * GET /api/admin/health - Health check endpoint
 */
admin.get('/health', async (c) => {
  const requestId = c.get('requestId');

  return c.json(
    formatResponse(
      true,
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
      null,
      requestId
    )
  );
});

export default admin;
