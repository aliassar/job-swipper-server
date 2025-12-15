import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { emailConnectionService } from '../services/email-connection.service';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const emailConnections = new Hono<AppContext>();

// Validation schemas
const addImapSchema = z.object({
  email: z.string().email(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
});

// GET /api/email-connections - List connected emails
emailConnections.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const connections = await emailConnectionService.listConnections(auth.userId);

  return c.json(formatResponse(true, connections, null, requestId));
});

// POST /api/email-connections/gmail - Start Gmail OAuth
emailConnections.post('/gmail', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const host = c.req.header('host');
  const redirectUri = `${protocol}://${host}/api/email-connections/gmail/callback`;

  const authUrl = await emailConnectionService.startGmailOAuth(auth.userId, redirectUri);

  return c.json(formatResponse(true, { authUrl }, null, requestId));
});

// GET /api/email-connections/gmail/callback - Gmail OAuth callback
emailConnections.get('/gmail/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    throw new ValidationError('Missing code or state parameter');
  }

  // Decode state to get user ID
  const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  const userId = stateData.userId;

  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const host = c.req.header('host');
  const redirectUri = `${protocol}://${host}/api/email-connections/gmail/callback`;

  const connection = await emailConnectionService.completeGmailOAuth(userId, code, redirectUri);

  // Redirect to frontend success page
  return c.redirect(`/email-connections/success?provider=gmail&email=${encodeURIComponent(connection.email)}`);
});

// POST /api/email-connections/outlook - Start Outlook OAuth
emailConnections.post('/outlook', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const host = c.req.header('host');
  const redirectUri = `${protocol}://${host}/api/email-connections/outlook/callback`;

  const authUrl = await emailConnectionService.startOutlookOAuth(auth.userId, redirectUri);

  return c.json(formatResponse(true, { authUrl }, null, requestId));
});

// GET /api/email-connections/outlook/callback - Outlook OAuth callback
emailConnections.get('/outlook/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    throw new ValidationError('Missing code or state parameter');
  }

  // Decode state to get user ID
  const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  const userId = stateData.userId;

  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const host = c.req.header('host');
  const redirectUri = `${protocol}://${host}/api/email-connections/outlook/callback`;

  const connection = await emailConnectionService.completeOutlookOAuth(userId, code, redirectUri);

  // Redirect to frontend success page
  return c.redirect(`/email-connections/success?provider=outlook&email=${encodeURIComponent(connection.email)}`);
});

// POST /api/email-connections/yahoo - Start Yahoo OAuth
emailConnections.post('/yahoo', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const host = c.req.header('host');
  const redirectUri = `${protocol}://${host}/api/email-connections/yahoo/callback`;

  const authUrl = await emailConnectionService.startYahooOAuth(auth.userId, redirectUri);

  return c.json(formatResponse(true, { authUrl }, null, requestId));
});

// GET /api/email-connections/yahoo/callback - Yahoo OAuth callback
emailConnections.get('/yahoo/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');

  if (!code || !state) {
    throw new ValidationError('Missing code or state parameter');
  }

  // Decode state to get user ID
  const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  const userId = stateData.userId;

  const protocol = c.req.header('x-forwarded-proto') || 'https';
  const host = c.req.header('host');
  const redirectUri = `${protocol}://${host}/api/email-connections/yahoo/callback`;

  const connection = await emailConnectionService.completeYahooOAuth(userId, code, redirectUri);

  // Redirect to frontend success page
  return c.redirect(`/email-connections/success?provider=yahoo&email=${encodeURIComponent(connection.email)}`);
});

// POST /api/email-connections/imap - Add IMAP connection
emailConnections.post('/imap', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = addImapSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const { email, host, port, username, password } = validated.data;

  // Test connection first
  const isValid = await emailConnectionService.testImapConnection(host, port, username, password);

  if (!isValid) {
    throw new ValidationError('IMAP connection test failed. Please check your credentials.');
  }

  const connection = await emailConnectionService.addImapConnection(
    auth.userId,
    email,
    host,
    port,
    username,
    password
  );

  return c.json(formatResponse(true, connection, null, requestId));
});

// DELETE /api/email-connections/:id - Remove connection
emailConnections.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const connectionId = c.req.param('id');

  await emailConnectionService.removeConnection(auth.userId, connectionId);

  return c.json(formatResponse(true, { message: 'Connection removed' }, null, requestId));
});

// POST /api/email-connections/:id/test - Test connection
emailConnections.post('/:id/test', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const connectionId = c.req.param('id');

  const isValid = await emailConnectionService.testConnection(auth.userId, connectionId);

  return c.json(formatResponse(true, { valid: isValid }, null, requestId));
});

// POST /api/email-connections/:id/sync - Manually send credentials to Stage Updater
emailConnections.post('/:id/sync', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const connectionId = c.req.param('id');

  const result = await emailConnectionService.syncCredentialsToStageUpdater(
    auth.userId,
    connectionId,
    requestId
  );

  return c.json(formatResponse(true, result, null, requestId));
});

export default emailConnections;
