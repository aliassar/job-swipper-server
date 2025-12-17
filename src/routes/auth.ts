import { Hono } from 'hono';
import { z } from 'zod';
import { sign, verify } from 'hono/jwt';
import { AppContext } from '../types';
import { authService } from '../services/auth.service';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { authMiddleware } from '../middleware/auth';
import { db } from '../lib/db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../middleware/logger';

const auth = new Hono<AppContext>();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({
  token: z.string(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

// Helper function to get frontend URL
const getFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';
// Helper function to get server URL (for OAuth callbacks)
const getServerUrl = () => process.env.API_URL || 'http://localhost:5000';

// POST /auth/register - Email/password signup
auth.post('/register', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = registerSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  try {
    const { user, token } = await authService.register(
      validated.data.email,
      validated.data.password
    );

    return c.json(
      formatResponse(
        true,
        {
          user,
          token,
          message: 'Registration successful. Please check your email to verify your account.',
        },
        null,
        requestId
      )
    );
  } catch (error) {
    logger.error({ error, requestId }, 'Registration failed in route handler');
    throw error;
  }
});

// POST /auth/login - Email/password login
auth.post('/login', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = loginSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const { user, token } = await authService.login(
    validated.data.email,
    validated.data.password
  );

  return c.json(
    formatResponse(
      true,
      {
        user,
        token,
      },
      null,
      requestId
    )
  );
});

// POST /auth/verify-email - Verify email token
auth.post('/verify-email', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = verifyEmailSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  await authService.verifyEmail(validated.data.token);

  return c.json(
    formatResponse(true, { message: 'Email verified successfully' }, null, requestId)
  );
});

// POST /auth/forgot-password - Request password reset
auth.post('/forgot-password', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = forgotPasswordSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  await authService.requestPasswordReset(validated.data.email, requestId);

  return c.json(
    formatResponse(
      true,
      { message: 'Password reset email sent if account exists' },
      null,
      requestId
    )
  );
});

// POST /auth/reset-password - Reset password with token
auth.post('/reset-password', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = resetPasswordSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  await authService.resetPassword(validated.data.token, validated.data.newPassword);

  return c.json(
    formatResponse(true, { message: 'Password reset successfully' }, null, requestId)
  );
});

// GET /auth/google - Google OAuth initiation
auth.get('/google', async (c) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${getServerUrl()}/api/auth/google/callback`;

  if (!clientId) {
    throw new Error('Google OAuth not configured');
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email profile`;

  return c.redirect(authUrl);
});

// GET /auth/google/callback - Google OAuth callback
auth.get('/google/callback', async (c) => {
  try {
    const code = c.req.query('code');

    if (!code) {
      throw new ValidationError('Missing authorization code');
    }

    const { token } = await authService.googleOAuthCallback(code);

    const frontendUrl = getFrontendUrl();
    return c.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=google`);
  } catch (error) {
    const frontendUrl = getFrontendUrl();
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : 'OAuth authentication failed'
    );
    return c.redirect(`${frontendUrl}/auth/callback?error=${errorMessage}`);
  }
});

// GET /auth/github - GitHub OAuth initiation
auth.get('/github', async (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${getServerUrl()}/api/auth/github/callback`;

  if (!clientId) {
    throw new Error('GitHub OAuth not configured');
  }

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`;

  return c.redirect(authUrl);
});

// GET /auth/github/callback - GitHub OAuth callback
auth.get('/github/callback', async (c) => {
  try {
    const code = c.req.query('code');

    if (!code) {
      throw new ValidationError('Missing authorization code');
    }

    const { token } = await authService.githubOAuthCallback(code);

    const frontendUrl = getFrontendUrl();
    return c.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=github`);
  } catch (error) {
    const frontendUrl = getFrontendUrl();
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : 'OAuth authentication failed'
    );
    return c.redirect(`${frontendUrl}/auth/callback?error=${errorMessage}`);
  }
});

/*
// GET /auth/yahoo - Yahoo OAuth initiation
auth.get('/yahoo', async (c) => {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const redirectUri = `${getServerUrl()}/api/auth/yahoo/callback`;

  if (!clientId) {
    throw new Error('Yahoo OAuth not configured');
  }

  const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid email profile`;

  return c.redirect(authUrl);
});

// GET /auth/yahoo/callback - Yahoo OAuth callback
auth.get('/yahoo/callback', async (c) => {
  try {
    const code = c.req.query('code');

    if (!code) {
      throw new ValidationError('Missing authorization code');
    }

    const { token } = await authService.yahooOAuthCallback(code);

    const frontendUrl = getFrontendUrl();
    return c.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=yahoo`);
  } catch (error) {
    const frontendUrl = getFrontendUrl();
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : 'OAuth authentication failed'
    );
    return c.redirect(`${frontendUrl}/auth/callback?error=${errorMessage}`);
  }
});

// GET /auth/microsoft - Microsoft OAuth initiation
auth.get('/microsoft', async (c) => {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = `${getServerUrl()}/api/auth/microsoft/callback`;

  if (!clientId) {
    throw new Error('Microsoft OAuth not configured');
  }

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=user.read mail.read`;

  return c.redirect(authUrl);
});

// GET /auth/microsoft/callback - Microsoft OAuth callback
auth.get('/microsoft/callback', async (c) => {
  try {
    const code = c.req.query('code');

    if (!code) {
      throw new ValidationError('Missing authorization code');
    }

    const { token } = await authService.microsoftOAuthCallback(code);

    const frontendUrl = getFrontendUrl();
    return c.redirect(`${frontendUrl}/auth/callback?token=${token}&provider=microsoft`);
  } catch (error) {
    const frontendUrl = getFrontendUrl();
    const errorMessage = encodeURIComponent(
      error instanceof Error ? error.message : 'OAuth authentication failed'
    );
    return c.redirect(`${frontendUrl}/auth/callback?error=${errorMessage}`);
  }
});
*/

// POST /auth/logout - Logout (client-side token removal)
auth.post('/logout', async (c) => {
  const requestId = c.get('requestId');

  // With JWT, logout is handled client-side by removing the token
  // No server-side action needed unless implementing token blacklist

  return c.json(
    formatResponse(true, { message: 'Logged out successfully' }, null, requestId)
  );
});

// GET /auth/me - Get current user (requires auth middleware)
auth.get('/me', authMiddleware, async (c) => {
  const authContext = c.get('auth');
  const requestId = c.get('requestId');

  return c.json(
    formatResponse(
      true,
      {
        userId: authContext.userId,
      },
      null,
      requestId
    )
  );
});

/**
 * Parse JWT expiration string to seconds
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 7 * 24 * 60 * 60; // Default 7 days
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: return 7 * 24 * 60 * 60;
  }
}

/**
 * POST /api/auth/refresh - Refresh JWT token
 * 
 * Requires valid (but possibly near-expiry) token in Authorization header
 * Returns a new token with extended expiration
 * 
 * @returns New JWT token
 * @throws 401 - If token is invalid or expired
 */
auth.post('/refresh', async (c) => {
  const requestId = c.get('requestId');

  // Get token from Authorization header
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(formatResponse(false, null, {
      code: 'UNAUTHORIZED',
      message: 'No token provided',
    }, requestId), 401);
  }

  const token = authHeader.substring(7);

  // Ensure JWT_SECRET is configured
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    logger.error('JWT_SECRET environment variable is not configured');
    return c.json(formatResponse(false, null, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Token refresh failed',
    }, requestId), 500);
  }

  try {
    // Verify the existing token (this will fail if completely expired)
    const payload = await verify(token, jwtSecret);

    if (!payload || !payload.userId) {
      return c.json(formatResponse(false, null, {
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      }, requestId), 401);
    }

    // Check if user still exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId as string))
      .limit(1);

    if (user.length === 0) {
      return c.json(formatResponse(false, null, {
        code: 'UNAUTHORIZED',
        message: 'User not found',
      }, requestId), 401);
    }

    // Generate new token with extended expiration
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const expiresInSeconds = parseExpiresIn(expiresIn);

    const newToken = await sign(
      {
        userId: payload.userId,
        email: user[0].email,
        emailVerified: user[0].emailVerified,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      },
      jwtSecret
    );

    logger.info({ userId: payload.userId }, 'Token refreshed');

    return c.json(formatResponse(true, { token: newToken }, null, requestId));
  } catch (error) {
    logger.error({ error }, 'Token refresh failed');
    return c.json(formatResponse(false, null, {
      code: 'UNAUTHORIZED',
      message: 'Token refresh failed',
    }, requestId), 401);
  }
});

// POST /auth/exchange - Exchange provider token for app token
const exchangeSchema = z.object({
  provider: z.enum(['google', 'github']),
  token: z.string(),
});

auth.post('/exchange', async (c) => {
  const requestId = c.get('requestId');
  const body = await c.req.json();
  const validated = exchangeSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const { user, token } = await authService.exchangeOAuthToken(
    validated.data.provider,
    validated.data.token
  );

  return c.json(
    formatResponse(true, { user, token }, null, requestId)
  );
});

export default auth;
