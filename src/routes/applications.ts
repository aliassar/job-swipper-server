import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { applicationService } from '../services/application.service';
import { formatResponse, parseIntSafe } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const applications = new Hono<AppContext>();

// Validation schemas
const updateStageSchema = z.object({
  stage: z.enum([
    'Syncing',
    'CV Check',
    'Message Check',
    'Being Applied',
    'Applied',
    'Interview 1',
    'Next Interviews',
    'Offer',
    'Rejected',
    'Accepted',
    'Withdrawn',
    'Failed',
  ]),
});

// GET /api/applications - Get applications
applications.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = c.req.query('search');

  const result = await applicationService.getApplications(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

// PUT /api/applications/:id/stage - Update application stage
applications.put('/:id/stage', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateStageSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateApplicationStage(
    auth.userId,
    applicationId,
    validated.data.stage
  );

  return c.json(formatResponse(true, application, null, requestId));
});

export default applications;
