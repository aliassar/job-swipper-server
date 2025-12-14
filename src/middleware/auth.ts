import { Context, Next } from 'hono';
import { AppContext } from '../types';
import { AuthenticationError } from '../lib/errors';
import { authService } from '../services/auth.service';

// Authentication middleware with JWT support
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    throw new AuthenticationError('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    throw new AuthenticationError('Invalid authorization header format');
  }

  try {
    // Verify and decode JWT token
    const user = authService.verifyToken(token);

    c.set('auth', {
      userId: user.id,
      sessionToken: token,
    });

    await next();
  } catch (error) {
    throw new AuthenticationError('Invalid or expired token');
  }
}
