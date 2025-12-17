import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { emailConnectionService } from '../services/email-connection.service';
import { formatResponse } from '../lib/utils';
import { ValidationError, NotFoundError } from '../lib/errors';
import { validateUuidParam } from '../middleware/validate-params';
import { logger } from '../middleware/logger';

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

/**
 * POST /api/email-connections/:id/sync - Sync email connection to stage updater
 * 
 * @param id - Email connection UUID
 * 
 * Syncs the email credentials to the stage updater microservice
 * so it can monitor emails for application status updates.
 * 
 * @returns Success message with sync status
 * @throws 400 - If connection ID is invalid
 * @throws 404 - If connection not found
 */
emailConnections.post('/:id/sync', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const connectionId = c.req.param('id');

  try {
    // Get the email connection
    const connection = await emailConnectionService.getConnection(auth.userId, connectionId);
    
    // Sync to stage updater microservice if configured
    if (process.env.STAGE_UPDATER_SERVICE_URL) {
      const syncResult = await emailConnectionService.syncToStageUpdater(connection);
      
      logger.info({ 
        userId: auth.userId, 
        connectionId, 
        provider: connection.provider 
      }, 'Email connection synced to stage updater');
      
      return c.json(formatResponse(true, { 
        message: 'Email connection synced successfully',
        synced: true,
        syncedAt: new Date().toISOString(),
      }, null, requestId));
    } else {
      // Stage updater not configured - return success but indicate not synced
      logger.warn({ connectionId }, 'Stage updater service not configured');
      
      return c.json(formatResponse(true, { 
        message: 'Sync skipped - stage updater service not configured',
        synced: false,
      }, null, requestId));
    }
  } catch (error) {
    logger.error({ error, connectionId }, 'Failed to sync email connection');
    throw error;
  }
});

export default emailConnections;
