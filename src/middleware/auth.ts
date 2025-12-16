import { Context, Next } from 'hono';
import { AppContext } from '../types';
import { AuthenticationError } from '../lib/errors';
import { authService } from '../services/auth.service';
import { logger } from './logger';

// Authentication middleware with JWT support
export async function authMiddleware(c: Context<AppContext>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const requestId = c.get('requestId') || 'unknown';

  if (!authHeader) {
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'missing_header',
    }, 'Authentication failed - missing authorization header');
    
    throw new AuthenticationError('Missing authorization header');
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'invalid_format',
    }, 'Authentication failed - invalid header format');
    
    throw new AuthenticationError('Invalid authorization header format');
  }

  // Check for placeholder/invalid tokens that are not valid JWTs
  if (token === 'authenticated' || token === 'placeholder' || token === 'null' || token === 'undefined') {
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'placeholder_token',
      token: token.substring(0, 20), // Log partial token for debugging
    }, 'Authentication failed - placeholder or invalid token detected');
    
    throw new AuthenticationError('Invalid authentication token. Please login to get a valid JWT token.');
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
    logger.warn({
      requestId,
      event: 'auth_failed',
      reason: 'invalid_token',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'Authentication failed - invalid or expired token');
    
    // Provide more specific error message based on the error type
    if (error instanceof Error) {
      if (error.message.includes('jwt expired')) {
        throw new AuthenticationError('Authentication token has expired. Please login again.');
      } else if (error.message.includes('jwt malformed') || error.message.includes('invalid token')) {
        throw new AuthenticationError('Invalid authentication token format. Please provide a valid JWT token.');
      }
    }
    
    throw new AuthenticationError('Invalid or expired authentication token. Please login again.');
  }
}
