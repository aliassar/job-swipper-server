import { Context, Next } from 'hono';
import { db } from '../lib/db';
import { idempotencyKeys } from '../db/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { AppContext } from '../types';
import { logger } from './logger';

// Idempotency key header name
const IDEMPOTENCY_KEY_HEADER = 'x-idempotency-key';

// How long to cache idempotency responses (24 hours)
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;



/**
 * Middleware to enforce idempotency for POST/PUT/DELETE requests.
 * 
 * If a request includes an X-Idempotency-Key header:
 * 1. Check if we've seen this key before for this user
 * 2. If yes, return the cached response (don't execute handler again)
 * 3. If no, execute the handler and cache the response
 * 
 * This prevents duplicate operations from offline queue retries.
 */
export async function idempotencyMiddleware(c: Context<AppContext>, next: Next) {
    // Only apply to mutating methods
    const method = c.req.method.toUpperCase();
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        return await next();
    }

    // Check for idempotency key header
    const idempotencyKey = c.req.header(IDEMPOTENCY_KEY_HEADER);
    if (!idempotencyKey) {
        // No idempotency key - proceed normally
        return await next();
    }

    // Get authenticated user
    const auth = c.get('auth');
    if (!auth?.userId) {
        // Not authenticated - can't enforce per-user idempotency
        return await next();
    }

    const userId = auth.userId;
    const now = new Date();

    try {
        // Check if this key already exists and hasn't expired
        const existing = await db
            .select()
            .from(idempotencyKeys)
            .where(
                and(
                    eq(idempotencyKeys.userId, userId),
                    eq(idempotencyKeys.key, idempotencyKey),
                    gt(idempotencyKeys.expiresAt, now)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            // Return cached response (replay)
            const cached = existing[0];
            logger.info(
                { userId, idempotencyKey, statusCode: cached.statusCode },
                'Idempotency: Returning cached response'
            );

            return c.json(cached.response, cached.statusCode as any);
        }

        // Execute the actual handler
        await next();

        // After handler completes, capture and store the response
        // Note: We need to clone the response body since it can only be read once
        const responseClone = c.res.clone();
        let responseBody: unknown;

        try {
            responseBody = await responseClone.json();
        } catch {
            // Response isn't JSON - don't cache
            logger.debug({ userId, idempotencyKey }, 'Idempotency: Non-JSON response, not caching');
            return;
        }

        const statusCode = c.res.status;
        const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);

        // Store the response for future replays
        // Use upsert to handle potential race conditions
        try {
            await db
                .insert(idempotencyKeys)
                .values({
                    key: idempotencyKey,
                    userId,
                    response: responseBody,
                    statusCode,
                    expiresAt,
                })
                .onConflictDoUpdate({
                    target: [idempotencyKeys.userId, idempotencyKeys.key],
                    set: {
                        response: responseBody,
                        statusCode,
                        expiresAt,
                    },
                });

            logger.debug(
                { userId, idempotencyKey, statusCode },
                'Idempotency: Cached response for future replays'
            );
        } catch (error) {
            // Don't fail the request if caching fails
            logger.error({ error, userId, idempotencyKey }, 'Failed to cache idempotency response');
        }
    } catch (error) {
        logger.error({ error, userId, idempotencyKey }, 'Error in idempotency middleware');
        // Don't fail the request - just proceed without idempotency
        return await next();
    }
}

/**
 * Cleanup expired idempotency keys.
 * Should be called periodically (e.g., via cron job).
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
    const now = new Date();

    const result = await db
        .delete(idempotencyKeys)
        .where(lt(idempotencyKeys.expiresAt, now))
        .returning({ id: idempotencyKeys.id });

    const count = result.length;
    if (count > 0) {
        logger.info({ count }, 'Cleaned up expired idempotency keys');
    }

    return count;
}
