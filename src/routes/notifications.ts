import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { AppContext } from '../types';
import { notificationService } from '../services/notification.service';
import { formatResponse, parseIntSafe } from '../lib/utils';
import { validateUuidParam } from '../middleware/validate-params';

const notifications = new Hono<AppContext>();

/**
 * GET /notifications - List notifications with pagination
 * 
 * Query parameters:
 * @param page - Page number (default: 1)
 * @param limit - Results per page (default: 20)
 * 
 * @returns Paginated list of notifications
 */
notifications.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);

  const result = await notificationService.getNotifications(auth.userId, page, limit);

  // Get unread count for the response
  const unreadCount = await notificationService.getUnreadCount(auth.userId);

  return c.json(
    formatResponse(
      true,
      {
        items: result.items.map(item => ({
          ...item,
          timestamp: item.createdAt, // Add timestamp alias for frontend compatibility
        })),
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
        unreadCount, // Add unread count to response
      },
      null,
      requestId
    )
  );
});

/**
 * GET /notifications/stream - SSE endpoint for real-time notifications
 * 
 * Note: EventSource API doesn't support custom headers, so we accept token via query param
 * @query token - Auth JWT token
 * @returns Server-Sent Events stream with notifications
 */
notifications.get('/stream', async (c) => {
  // Try to get auth from middleware first, then fall back to query param
  let userId: string;

  const auth = c.get('auth');
  if (auth?.userId) {
    userId = auth.userId;
  } else {
    // EventSource doesn't support Authorization header, so accept token via query param
    const token = c.req.query('token');
    if (!token) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    try {
      const { authService } = await import('../services/auth.service');
      const user = authService.verifyToken(token);
      userId = user.id;
    } catch (error) {
      return c.json({ error: 'Invalid token' }, 401);
    }
  }

  // Set SSE headers BEFORE starting the stream
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');
  c.header('X-Accel-Buffering', 'no'); // Disable nginx buffering

  return stream(c, async (stream) => {
    // Send initial connection message with unread count
    const unreadCount = await notificationService.getUnreadCount(userId);
    await stream.writeln(`data: ${JSON.stringify({ type: 'connected', unreadCount })}\n`);

    // Subscribe to notifications
    const unsubscribe = notificationService.subscribeToNotifications(
      userId,
      async (notification) => {
        await stream.writeln(`data: ${JSON.stringify(notification)}\n`);
      }
    );

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeln(': heartbeat\n');
      } catch (error) {
        clearInterval(heartbeatInterval);
        unsubscribe();
      }
    }, 30000); // Send heartbeat every 30 seconds

    // Clean up on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeatInterval);
      unsubscribe();
    });
  });
});

/**
 * POST /notifications/:id/read - Mark notification as read
 * 
 * @param id - Notification UUID
 * 
 * @returns Success message
 * @throws 400 - If notification ID is invalid
 * @throws 404 - If notification not found
 */
notifications.post('/:id/read', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const notificationId = c.req.param('id');

  await notificationService.markAsRead(auth.userId, notificationId);

  return c.json(
    formatResponse(true, { message: 'Notification marked as read' }, null, requestId)
  );
});

/**
 * POST /notifications/read-all - Mark all notifications as read
 * 
 * @returns Success message
 */
notifications.post('/read-all', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  await notificationService.markAllAsRead(auth.userId);

  return c.json(
    formatResponse(true, { message: 'All notifications marked as read' }, null, requestId)
  );
});

/**
 * DELETE /notifications/:id - Delete single notification
 * 
 * @param id - Notification UUID
 * 
 * @returns Success message
 * @throws 400 - If notification ID is invalid
 * @throws 404 - If notification not found
 */
notifications.delete('/:id', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const notificationId = c.req.param('id');

  await notificationService.deleteNotification(auth.userId, notificationId);

  return c.json(
    formatResponse(true, { message: 'Notification deleted' }, null, requestId)
  );
});

/**
 * DELETE /notifications - Clear all notifications
 * 
 * @returns Success message
 */
notifications.delete('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  await notificationService.clearAllNotifications(auth.userId);

  return c.json(
    formatResponse(true, { message: 'All notifications cleared' }, null, requestId)
  );
});

/**
 * GET /notifications/unread-count - Get unread notification count
 * 
 * @returns Object with count of unread notifications
 */
notifications.get('/unread-count', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const count = await notificationService.getUnreadCount(auth.userId);

  return c.json(formatResponse(true, { count }, null, requestId));
});

export default notifications;
