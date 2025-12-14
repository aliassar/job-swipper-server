import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { AppContext } from '../types';
import { notificationService } from '../services/notification.service';
import { formatResponse, parseIntSafe } from '../lib/utils';

const notifications = new Hono<AppContext>();

// GET /notifications - List notifications with pagination
notifications.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);

  const result = await notificationService.getNotifications(auth.userId, page, limit);

  return c.json(
    formatResponse(
      true,
      {
        items: result.items,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      null,
      requestId
    )
  );
});

// GET /notifications/stream - SSE endpoint for real-time notifications
notifications.get('/stream', async (c) => {
  const auth = c.get('auth');

  return stream(c, async (stream) => {
    // Set SSE headers
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    // Send initial connection message
    await stream.writeln('data: {"type":"connected"}\n');

    // Subscribe to notifications
    const unsubscribe = notificationService.subscribeToNotifications(
      auth.userId,
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

// POST /notifications/:id/read - Mark as read
notifications.post('/:id/read', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const notificationId = c.req.param('id');

  await notificationService.markAsRead(auth.userId, notificationId);

  return c.json(
    formatResponse(true, { message: 'Notification marked as read' }, null, requestId)
  );
});

// POST /notifications/read-all - Mark all as read
notifications.post('/read-all', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  await notificationService.markAllAsRead(auth.userId);

  return c.json(
    formatResponse(true, { message: 'All notifications marked as read' }, null, requestId)
  );
});

// DELETE /notifications/:id - Delete single notification
notifications.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const notificationId = c.req.param('id');

  await notificationService.deleteNotification(auth.userId, notificationId);

  return c.json(
    formatResponse(true, { message: 'Notification deleted' }, null, requestId)
  );
});

// DELETE /notifications - Clear all notifications
notifications.delete('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  await notificationService.clearAllNotifications(auth.userId);

  return c.json(
    formatResponse(true, { message: 'All notifications cleared' }, null, requestId)
  );
});

// GET /notifications/unread-count - Get unread count
notifications.get('/unread-count', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const count = await notificationService.getUnreadCount(auth.userId);

  return c.json(formatResponse(true, { count }, null, requestId));
});

export default notifications;
