import { db } from '../lib/db';
import { notifications } from '../db/schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { EventEmitter } from 'events';

export type NotificationType =
  | 'cv_ready'
  | 'message_ready'
  | 'status_changed'
  | 'follow_up_reminder'
  | 'verification_needed'
  | 'generation_failed'
  | 'apply_failed';

interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface NotificationData {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

// EventEmitter for SSE broadcasts
class NotificationEmitter extends EventEmitter {}
const notificationEmitter = new NotificationEmitter();

export const notificationService = {
  /**
   * Create a new notification
   */
  async createNotification(data: CreateNotificationData): Promise<NotificationData> {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        metadata: data.metadata || {},
        isRead: false,
      })
      .returning();

    // Emit event for SSE listeners
    notificationEmitter.emit(`notification:${data.userId}`, notification);

    return notification as NotificationData;
  },

  /**
   * Get notifications for a user with pagination
   */
  async getNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ items: NotificationData[]; total: number }> {
    const offset = (page - 1) * limit;

    const items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(notifications)
      .where(eq(notifications.userId, userId));

    return {
      items: items as NotificationData[],
      total: totalCount,
    };
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  },

  /**
   * Delete a notification
   */
  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    await db
      .delete(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  },

  /**
   * Clear all notifications for a user
   */
  async clearAllNotifications(userId: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.userId, userId));
  },

  /**
   * Subscribe to user notifications via SSE
   */
  subscribeToNotifications(
    userId: string,
    callback: (notification: NotificationData) => void
  ): () => void {
    const listener = (notification: NotificationData) => {
      callback(notification);
    };

    notificationEmitter.on(`notification:${userId}`, listener);

    // Return unsubscribe function
    return () => {
      notificationEmitter.off(`notification:${userId}`, listener);
    };
  },

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string): Promise<number> {
    const [{ value: unreadCount }] = await db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    return unreadCount;
  },
};
