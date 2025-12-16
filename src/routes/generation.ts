import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { generationService } from '../services/generation.service';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { storage } from '../lib/storage';
import { validateUuidParam } from '../middleware/validate-params';

const generation = new Hono<AppContext>();

// Validation schemas
const generateResumeSchema = z.object({
  baseResumeId: z.string().uuid(),
});

// POST /api/jobs/:id/generate/resume - Generate tailored resume
generation.post('/jobs/:id/generate/resume', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const body = await c.req.json();
  const validated = generateResumeSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const resume = await generationService.generateResume(
    auth.userId,
    jobId,
    validated.data.baseResumeId,
    requestId
  );

  return c.json(formatResponse(true, resume, null, requestId), 201);
});

// POST /api/jobs/:id/generate/cover-letter - Generate cover letter
generation.post('/jobs/:id/generate/cover-letter', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const jobId = c.req.param('id');

  const coverLetter = await generationService.generateCoverLetter(
    auth.userId,
    jobId,
    requestId
  );

  return c.json(formatResponse(true, coverLetter, null, requestId), 201);
});

// GET /api/generated/resumes - List generated resumes
generation.get('/generated/resumes', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const resumes = await generationService.listGeneratedResumes(auth.userId);

  return c.json(formatResponse(true, resumes, null, requestId));
});

// GET /api/generated/cover-letters - List generated cover letters
generation.get('/generated/cover-letters', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const coverLetters = await generationService.listGeneratedCoverLetters(auth.userId);

  return c.json(formatResponse(true, coverLetters, null, requestId));
});

// GET /api/generated/resumes/:id/download - Download generated resume
generation.get('/generated/resumes/:id/download', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const resumeId = c.req.param('id');

  const resume = await generationService.getGeneratedResumeById(auth.userId, resumeId);

  // Generate signed URL for download
  const url = new URL(resume.fileUrl);
  const key = url.pathname.substring(1);
  const signedUrl = await storage.getSignedUrl(key, 3600);

  return c.json(
    formatResponse(true, { downloadUrl: signedUrl, filename: resume.filename }, null, requestId)
  );
});

// GET /api/generated/cover-letters/:id/download - Download generated cover letter
generation.get('/generated/cover-letters/:id/download', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const coverLetterId = c.req.param('id');

  const coverLetter = await generationService.getGeneratedCoverLetterById(auth.userId, coverLetterId);

  // Generate signed URL for download
  const url = new URL(coverLetter.fileUrl);
  const key = url.pathname.substring(1);
  const signedUrl = await storage.getSignedUrl(key, 3600);

  return c.json(
    formatResponse(
      true,
      { downloadUrl: signedUrl, filename: coverLetter.filename },
      null,
      requestId
    )
  );
});

export default generation;
