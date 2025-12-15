import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { applicationService } from '../services/application.service';
import { formatResponse, parseIntSafe, extractS3KeyFromUrl } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { storage } from '../lib/storage';

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

const updateNotesSchema = z.object({
  notes: z.string(),
});

const updateMessageSchema = z.object({
  message: z.string(),
});

const updateDocumentsSchema = z.object({
  resumeUrl: z.string().url().optional().nullable(),
  coverLetterUrl: z.string().url().optional().nullable(),
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

// GET /api/applications/:id - Full details with job and docs
applications.get('/:id', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  return c.json(formatResponse(true, application, null, requestId));
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

// PUT /api/applications/:id/notes - Update notes
applications.put('/:id/notes', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateNotesSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateApplicationNotes(
    auth.userId,
    applicationId,
    validated.data.notes
  );

  return c.json(formatResponse(true, application, null, requestId));
});

// POST /api/applications/:id/cv/confirm - Confirm CV
applications.post('/:id/cv/confirm', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.confirmCvVerification(auth.userId, applicationId);

  return c.json(formatResponse(true, application, null, requestId));
});

// POST /api/applications/:id/cv/reupload - Reupload CV
applications.post('/:id/cv/reupload', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  // Get file from form data
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    throw new ValidationError('No file provided');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const newResumeFile = {
    filename: file.name,
    buffer,
    mimetype: file.type,
  };

  const application = await applicationService.rejectCvAndReupload(
    auth.userId,
    applicationId,
    newResumeFile
  );

  return c.json(formatResponse(true, application, null, requestId));
});

// POST /api/applications/:id/message/confirm - Confirm message
applications.post('/:id/message/confirm', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.confirmMessageVerification(auth.userId, applicationId);

  return c.json(formatResponse(true, application, null, requestId));
});

// PUT /api/applications/:id/message - Edit message
applications.put('/:id/message', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateMessageSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateAndConfirmMessage(
    auth.userId,
    applicationId,
    validated.data.message
  );

  return c.json(formatResponse(true, application, null, requestId));
});

// GET /api/applications/:id/download/resume - Download generated resume
applications.get('/:id/download/resume', async (c) => {
  const auth = c.get('auth');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  if (!application.generatedResume) {
    throw new ValidationError('No generated resume found');
  }

  // Get presigned URL for download
  const key = extractS3KeyFromUrl(application.generatedResume.fileUrl);
  const downloadUrl = await storage.getPresignedUrl(key);

  return c.redirect(downloadUrl);
});

// GET /api/applications/:id/download/cover-letter - Download cover letter
applications.get('/:id/download/cover-letter', async (c) => {
  const auth = c.get('auth');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  if (!application.generatedCoverLetter) {
    throw new ValidationError('No generated cover letter found');
  }

  // Get presigned URL for download
  const key = extractS3KeyFromUrl(application.generatedCoverLetter.fileUrl);
  const downloadUrl = await storage.getPresignedUrl(key);

  return c.redirect(downloadUrl);
});

// POST /api/applications/:id/toggle-auto-status - Toggle auto status for application
applications.post('/:id/toggle-auto-status', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.toggleAutoStatus(auth.userId, applicationId);

  return c.json(formatResponse(true, application, null, requestId));
});

// GET /api/applications/:id/documents - Get application documents
applications.get('/:id/documents', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  const documents = {
    generatedResume: application.generatedResume ? {
      fileUrl: application.generatedResume.fileUrl,
      fileName: application.generatedResume.filename,
      createdAt: application.generatedResume.createdAt,
    } : null,
    generatedCoverLetter: application.generatedCoverLetter ? {
      fileUrl: application.generatedCoverLetter.fileUrl,
      fileName: application.generatedCoverLetter.filename,
      createdAt: application.generatedCoverLetter.createdAt,
    } : null,
  };

  return c.json(formatResponse(true, documents, null, requestId));
});

// PUT /api/applications/:id/documents - Update custom document URLs
applications.put('/:id/documents', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateDocumentsSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateCustomDocuments(
    auth.userId,
    applicationId,
    validated.data.resumeUrl,
    validated.data.coverLetterUrl
  );

  return c.json(formatResponse(true, application, null, requestId));
});

export default applications;
