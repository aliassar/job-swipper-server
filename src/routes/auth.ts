import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { authService } from '../services/auth.service';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { authMiddleware } from '../middleware/auth';

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

// POST /auth/register - Email/password signup
auth.post('/register', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = registerSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

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
  const redirectUri = `${process.env.NEXTAUTH_URL}/auth/google/callback`;

  if (!clientId) {
    throw new Error('Google OAuth not configured');
  }

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email profile`;

  return c.redirect(authUrl);
});

// GET /auth/google/callback - Google OAuth callback
auth.get('/google/callback', async (c) => {
  const requestId = c.get('requestId');
  const code = c.req.query('code');

  if (!code) {
    throw new ValidationError('Missing authorization code');
  }

  const { user, token } = await authService.googleOAuthCallback(code);

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

// GET /auth/github - GitHub OAuth initiation
auth.get('/github', async (c) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/auth/github/callback`;

  if (!clientId) {
    throw new Error('GitHub OAuth not configured');
  }

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email`;

  return c.redirect(authUrl);
});

// GET /auth/github/callback - GitHub OAuth callback
auth.get('/github/callback', async (c) => {
  const requestId = c.get('requestId');
  const code = c.req.query('code');

  if (!code) {
    throw new ValidationError('Missing authorization code');
  }

  const { user, token } = await authService.githubOAuthCallback(code);

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

export default auth;
