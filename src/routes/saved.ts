import { Hono } from 'hono';
import { AppContext } from '../types';
import { jobService } from '../services/job.service';
import { formatResponse, parseIntSafe, sanitizeSearchInput } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const saved = new Hono<AppContext>();

/**
 * GET /api/saved - Get saved jobs
 * 
 * Query parameters:
 * @param page - Page number (default: 1)
 * @param limit - Results per page (default: 20)
 * @param search - Optional search term
 * 
 * @returns Paginated list of saved jobs
 */
saved.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = sanitizeSearchInput(c.req.query('search'));

  const result = await jobService.getSavedJobs(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

/**
 * GET /api/saved/export - Export saved jobs to CSV or PDF
 * 
 * Query parameters:
 * @param format - Export format ('csv' or 'pdf')
 * @param search - Optional search term to filter jobs
 * 
 * @returns CSV file or PDF file with saved jobs
 * @throws 400 - If format is invalid
 */
saved.get('/export', async (c) => {
  const auth = c.get('auth');
  const format = c.req.query('format');
  const search = sanitizeSearchInput(c.req.query('search'));

  if (!format || !['csv', 'pdf'].includes(format)) {
    throw new ValidationError('Invalid format. Must be csv or pdf.');
  }

  // Get all saved jobs (no pagination for export)
  const result = await jobService.getSavedJobs(auth.userId, 1, 10000, search);

  if (format === 'csv') {
    const csvContent = await jobService.exportSavedJobsToCSV(result.items);
    
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="saved-jobs-${Date.now()}.csv"`);
    return c.text(csvContent);
  } else {
    const pdfBuffer = await jobService.exportSavedJobsToPDF(result.items);
    
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="saved-jobs-${Date.now()}.pdf"`,
      },
    });
  }
});

export default saved;
