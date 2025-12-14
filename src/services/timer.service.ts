import { db } from '../lib/db';
import { scheduledTimers } from '../db/schema';
import { eq, and, lte } from 'drizzle-orm';

export type TimerType =
  | 'auto_apply_delay'
  | 'cv_verification'
  | 'message_verification'
  | 'doc_deletion'
  | 'follow_up_reminder';

interface ScheduleTimerData {
  userId: string;
  type: TimerType;
  targetId: string;
  executeAt: Date;
  metadata?: Record<string, unknown>;
}

export const timerService = {
  /**
   * Schedule a timer
   */
  async scheduleTimer(data: ScheduleTimerData): Promise<string> {
    const [timer] = await db
      .insert(scheduledTimers)
      .values({
        userId: data.userId,
        type: data.type,
        targetId: data.targetId,
        executeAt: data.executeAt,
        executed: false,
        metadata: data.metadata || {},
      })
      .returning();

    return timer.id;
  },

  /**
   * Cancel a specific timer
   */
  async cancelTimer(timerId: string): Promise<void> {
    await db.delete(scheduledTimers).where(eq(scheduledTimers.id, timerId));
  },

  /**
   * Cancel all timers for a specific target
   */
  async cancelTimersByTarget(targetId: string, type?: TimerType): Promise<void> {
    if (type) {
      await db
        .delete(scheduledTimers)
        .where(
          and(
            eq(scheduledTimers.targetId, targetId),
            eq(scheduledTimers.type, type),
            eq(scheduledTimers.executed, false)
          )
        );
    } else {
      await db
        .delete(scheduledTimers)
        .where(and(eq(scheduledTimers.targetId, targetId), eq(scheduledTimers.executed, false)));
    }
  },

  /**
   * Schedule auto-apply delay timer (1 minute)
   */
  async scheduleAutoApplyDelay(userId: string, applicationId: string): Promise<string> {
    const executeAt = new Date();
    executeAt.setMinutes(executeAt.getMinutes() + 1); // 1 minute delay

    return this.scheduleTimer({
      userId,
      type: 'auto_apply_delay',
      targetId: applicationId,
      executeAt,
      metadata: { applicationId },
    });
  },

  /**
   * Schedule CV verification timer (5 minutes auto-confirm)
   */
  async scheduleCvVerificationTimer(userId: string, applicationId: string): Promise<string> {
    const executeAt = new Date();
    executeAt.setMinutes(executeAt.getMinutes() + 5); // 5 minute delay

    return this.scheduleTimer({
      userId,
      type: 'cv_verification',
      targetId: applicationId,
      executeAt,
      metadata: { applicationId },
    });
  },

  /**
   * Schedule message verification timer (5 minutes auto-confirm)
   */
  async scheduleMessageVerificationTimer(userId: string, applicationId: string): Promise<string> {
    const executeAt = new Date();
    executeAt.setMinutes(executeAt.getMinutes() + 5); // 5 minute delay

    return this.scheduleTimer({
      userId,
      type: 'message_verification',
      targetId: applicationId,
      executeAt,
      metadata: { applicationId },
    });
  },

  /**
   * Schedule document deletion timer (1 day after rollback)
   */
  async scheduleDocDeletionTimer(
    userId: string,
    resumeId: string,
    coverLetterId?: string
  ): Promise<string> {
    const executeAt = new Date();
    executeAt.setDate(executeAt.getDate() + 1); // 1 day delay

    return this.scheduleTimer({
      userId,
      type: 'doc_deletion',
      targetId: resumeId,
      executeAt,
      metadata: { resumeId, coverLetterId },
    });
  },

  /**
   * Schedule follow-up reminder
   */
  async scheduleFollowUpReminder(
    userId: string,
    applicationId: string,
    intervalDays: number
  ): Promise<string> {
    const executeAt = new Date();
    executeAt.setDate(executeAt.getDate() + intervalDays);

    return this.scheduleTimer({
      userId,
      type: 'follow_up_reminder',
      targetId: applicationId,
      executeAt,
      metadata: { applicationId },
    });
  },

  /**
   * Get pending timers that are ready to execute
   */
  async getPendingTimers(): Promise<Array<{
    id: string;
    userId: string;
    type: TimerType;
    targetId: string;
    executeAt: Date;
    metadata: Record<string, unknown>;
  }>> {
    const now = new Date();

    const timers = await db
      .select()
      .from(scheduledTimers)
      .where(and(eq(scheduledTimers.executed, false), lte(scheduledTimers.executeAt, now)));

    return timers as Array<{
      id: string;
      userId: string;
      type: TimerType;
      targetId: string;
      executeAt: Date;
      metadata: Record<string, unknown>;
    }>;
  },

  /**
   * Mark timer as executed
   */
  async markTimerExecuted(timerId: string): Promise<void> {
    await db
      .update(scheduledTimers)
      .set({ executed: true, executedAt: new Date() })
      .where(eq(scheduledTimers.id, timerId));
  },

  /**
   * Process pending timers
   * This should be called by a cron job
   */
  async processPendingTimers(): Promise<void> {
    const timers = await this.getPendingTimers();

    for (const timer of timers) {
      try {
        // Execute timer based on type
        switch (timer.type) {
          case 'auto_apply_delay':
            // TODO: Trigger auto-apply workflow
            console.log(`Processing auto-apply delay for application ${timer.targetId}`);
            break;

          case 'cv_verification':
            // TODO: Auto-confirm CV
            console.log(`Auto-confirming CV for application ${timer.targetId}`);
            break;

          case 'message_verification':
            // TODO: Auto-confirm message
            console.log(`Auto-confirming message for application ${timer.targetId}`);
            break;

          case 'doc_deletion':
            // TODO: Delete documents
            console.log(`Deleting documents: ${JSON.stringify(timer.metadata)}`);
            break;

          case 'follow_up_reminder':
            // TODO: Send follow-up reminder notification
            console.log(`Sending follow-up reminder for application ${timer.targetId}`);
            break;

          default:
            console.log(`Unknown timer type: ${timer.type}`);
        }

        // Mark as executed
        await this.markTimerExecuted(timer.id);
      } catch (error) {
        console.error(`Error processing timer ${timer.id}:`, error);
        // Don't mark as executed if it fails - will retry on next run
      }
    }
  },
};
