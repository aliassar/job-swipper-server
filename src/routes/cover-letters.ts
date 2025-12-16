import { Hono } from 'hono';
import { AppContext } from '../types';
import { coverLetterService } from '../services/cover-letter.service';
import { formatResponse } from '../lib/utils';
import { validateUuidParam } from '../middleware/validate-params';

const coverLetters = new Hono<AppContext>();

// GET /api/cover-letters - List cover letters
coverLetters.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const coverLetterList = await coverLetterService.listCoverLetters(auth.userId);

  return c.json(formatResponse(true, coverLetterList, null, requestId));
});

// GET /api/cover-letters/:id - Get cover letter details
coverLetters.get('/:id', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const coverLetterId = c.req.param('id');

  const coverLetter = await coverLetterService.getCoverLetterById(auth.userId, coverLetterId);

  return c.json(formatResponse(true, coverLetter, null, requestId));
});

// PATCH /api/cover-letters/:id/reference - Set as reference
coverLetters.patch('/:id/reference', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const coverLetterId = c.req.param('id');

  const coverLetter = await coverLetterService.setReference(auth.userId, coverLetterId);

  return c.json(formatResponse(true, coverLetter, null, requestId));
});

export default coverLetters;
