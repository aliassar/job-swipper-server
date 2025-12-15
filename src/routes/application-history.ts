import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { applicationService } from '../services/application.service';
import { formatResponse, parseIntSafe } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const applicationHistory = new Hono<AppContext>();

// Validation schemas
const exportSchema = z.object({
  format: z.enum(['csv', 'pdf']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  stage: z.string().optional(),
  search: z.string().optional(),
});

// GET /api/application-history - Query params: startDate, endDate, search, stage, page, limit
applicationHistory.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;
  const search = c.req.query('search');
  const stage = c.req.query('stage');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);

  const result = await applicationService.getApplicationHistory(auth.userId, {
    startDate,
    endDate,
    search,
    stage,
    page,
    limit,
  });

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/application-history/export - Query params: format (csv/pdf), date filters
applicationHistory.get('/export', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const format = c.req.query('format');
  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;
  const search = c.req.query('search');
  const stage = c.req.query('stage');

  if (!format || !['csv', 'pdf'].includes(format)) {
    throw new ValidationError('Invalid format. Must be csv or pdf.');
  }

  // Get all applications with filters (no pagination for export)
  const result = await applicationService.getApplicationHistory(auth.userId, {
    startDate,
    endDate,
    search,
    stage,
    page: 1,
    limit: 10000, // Get all
  });

  if (format === 'csv') {
    const csvContent = await applicationService.exportApplicationsToCSV(result.items);
    
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="applications-${Date.now()}.csv"`);
    return c.body(csvContent);
  } else {
    const pdfBuffer = await applicationService.exportApplicationsToPDF(result.items);
    
    c.header('Content-Type', 'application/pdf');
    c.header('Content-Disposition', `attachment; filename="applications-${Date.now()}.pdf"`);
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="applications-${Date.now()}.pdf"`,
      },
    });
  }
});

export default applicationHistory;
