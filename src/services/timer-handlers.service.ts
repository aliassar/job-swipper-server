import { db } from '../lib/db';
import { applications, generatedResumes, generatedCoverLetters, followUpTracking, userSettings } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../middleware/logger';
import { workflowService } from './workflow.service';
import { applicationService } from './application.service';
import { notificationService } from './notification.service';
import { timerService } from './timer.service';
import { storage } from '../lib/storage';

export interface Timer {
  id: string;
  userId: string;
  type: string;
  targetId: string;
  executeAt: Date;
  metadata: Record<string, unknown>;
}

export const timerHandlers = {
  /**
   * Handle auto-apply delay timer (1 minute after job acceptance)
   * Checks if workflow was rolled back before starting
   */
  async handleAutoApplyDelay(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Processing auto-apply delay timer');

    try {
      const applicationId = timer.targetId;

      // Get application
      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (application.length === 0) {
        logger.warn({ applicationId }, 'Application not found for auto-apply timer');
        return;
      }

      const app = application[0];

      // Check if there's a workflow run for this application
      const workflowRun = await workflowService.getWorkflowByApplication(applicationId);

      if (!workflowRun) {
        logger.warn({ applicationId }, 'No workflow run found for application');
        return;
      }

      // Check if workflow was cancelled (rolled back)
      if (workflowRun.status === 'cancelled') {
        logger.info({ applicationId, workflowRunId: workflowRun.id }, 'Workflow was cancelled, skipping auto-apply');
        return;
      }

      // Start workflow processing
      await workflowService.processWorkflow(workflowRun.id);

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing auto-apply delay timer');
      throw error;
    }
  },

  /**
   * Handle CV verification timeout (5 minutes after CV ready)
   * Auto-confirms CV if user hasn't responded
   */
  async handleCvVerificationTimeout(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Processing CV verification timeout');

    try {
      const applicationId = timer.targetId;

      // Get application
      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (application.length === 0) {
        logger.warn({ applicationId }, 'Application not found for CV verification timeout');
        return;
      }

      const app = application[0];

      // Only auto-confirm if still in CV Check stage
      if (app.stage !== 'CV Check') {
        logger.info({ applicationId, stage: app.stage }, 'Application not in CV Check stage, skipping auto-confirm');
        return;
      }

      // Auto-confirm CV
      logger.info({ applicationId }, 'Auto-confirming CV after timeout');

      // Get workflow run
      const workflowRun = await workflowService.getWorkflowByApplication(applicationId);
      if (workflowRun) {
        // Continue workflow processing
        await workflowService.processWorkflow(workflowRun.id);
      }

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing CV verification timeout');
      throw error;
    }
  },

  /**
   * Handle message verification timeout (5 minutes after message ready)
   * Auto-confirms message if user hasn't responded
   */
  async handleMessageVerificationTimeout(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Processing message verification timeout');

    try {
      const applicationId = timer.targetId;

      // Get application
      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (application.length === 0) {
        logger.warn({ applicationId }, 'Application not found for message verification timeout');
        return;
      }

      const app = application[0];

      // Only auto-confirm if still in Message Check stage
      if (app.stage !== 'Message Check') {
        logger.info({ applicationId, stage: app.stage }, 'Application not in Message Check stage, skipping auto-confirm');
        return;
      }

      // Auto-confirm message
      logger.info({ applicationId }, 'Auto-confirming message after timeout');

      // Get workflow run
      const workflowRun = await workflowService.getWorkflowByApplication(applicationId);
      if (workflowRun) {
        // Continue workflow processing
        await workflowService.processWorkflow(workflowRun.id);
      }

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing message verification timeout');
      throw error;
    }
  },

  /**
   * Handle document deletion timer (1 day after rollback)
   * Deletes generated documents if they weren't reused
   */
  async handleDocDeletion(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id }, 'Processing document deletion timer');

    try {
      const resumeId = timer.metadata.resumeId as string;
      const coverLetterId = timer.metadata.coverLetterId as string | undefined;

      // Check if resume is still being used by any application
      if (resumeId) {
        const resumeUsage = await db
          .select()
          .from(applications)
          .where(eq(applications.generatedResumeId, resumeId))
          .limit(1);

        if (resumeUsage.length > 0) {
          logger.info({ resumeId }, 'Resume is being used by an application, skipping deletion');
        } else {
          // Get resume details
          const resume = await db
            .select()
            .from(generatedResumes)
            .where(eq(generatedResumes.id, resumeId))
            .limit(1);

          if (resume.length > 0) {
            // Delete from storage
            try {
              const key = resume[0].fileUrl.split('.com/')[1]; // Extract S3 key from URL
              await storage.deleteFile(key);
            } catch (error) {
              logger.error({ error, resumeId }, 'Error deleting resume from storage');
            }

            // Delete from database
            await db.delete(generatedResumes).where(eq(generatedResumes.id, resumeId));
            logger.info({ resumeId }, 'Resume deleted successfully');
          }
        }
      }

      // Check if cover letter is still being used by any application
      if (coverLetterId) {
        const coverLetterUsage = await db
          .select()
          .from(applications)
          .where(eq(applications.generatedCoverLetterId, coverLetterId))
          .limit(1);

        if (coverLetterUsage.length > 0) {
          logger.info({ coverLetterId }, 'Cover letter is being used by an application, skipping deletion');
        } else {
          // Get cover letter details
          const coverLetter = await db
            .select()
            .from(generatedCoverLetters)
            .where(eq(generatedCoverLetters.id, coverLetterId))
            .limit(1);

          if (coverLetter.length > 0) {
            // Delete from storage
            try {
              const key = coverLetter[0].fileUrl.split('.com/')[1]; // Extract S3 key from URL
              await storage.deleteFile(key);
            } catch (error) {
              logger.error({ error, coverLetterId }, 'Error deleting cover letter from storage');
            }

            // Delete from database
            await db.delete(generatedCoverLetters).where(eq(generatedCoverLetters.id, coverLetterId));
            logger.info({ coverLetterId }, 'Cover letter deleted successfully');
          }
        }
      }

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing document deletion timer');
      throw error;
    }
  },

  /**
   * Handle follow-up reminder timer
   * Creates notification and sends auto follow-up if enabled (max 3 times)
   */
  async handleFollowUpReminder(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Processing follow-up reminder timer');

    try {
      const applicationId = timer.targetId;
      const userId = timer.userId;

      // Get application
      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (application.length === 0) {
        logger.warn({ applicationId }, 'Application not found for follow-up reminder');
        return;
      }

      const app = application[0];

      // Only send follow-up if application is in Applied or Interview stages
      if (!['Applied', 'Interview 1', 'Next Interviews'].includes(app.stage)) {
        logger.info({ applicationId, stage: app.stage }, 'Application not in valid stage for follow-up');
        return;
      }

      // Get or create follow-up tracking
      let tracking = await db
        .select()
        .from(followUpTracking)
        .where(eq(followUpTracking.applicationId, applicationId))
        .limit(1);

      let followUpCount = 0;
      if (tracking.length === 0) {
        // Create new tracking
        const [newTracking] = await db
          .insert(followUpTracking)
          .values({
            userId,
            applicationId,
            followUpCount: 1,
            lastFollowUpAt: new Date(),
          })
          .returning();
        followUpCount = 1;
      } else {
        followUpCount = tracking[0].followUpCount + 1;

        // Update tracking
        await db
          .update(followUpTracking)
          .set({
            followUpCount,
            lastFollowUpAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(followUpTracking.id, tracking[0].id));
      }

      // Check if we've reached max follow-ups
      if (followUpCount > 3) {
        logger.info({ applicationId, followUpCount }, 'Max follow-ups reached, stopping');
        return;
      }

      // Create notification
      await notificationService.createNotification(
        userId,
        'follow_up_reminder',
        'Follow-up Reminder',
        `Time to follow up on your application (Follow-up ${followUpCount}/3)`,
        { applicationId, followUpCount }
      );

      // Get user settings
      const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      if (settings.length > 0 && settings[0].autoFollowUpEnabled) {
        // TODO: Send automated follow-up email
        logger.info({ applicationId, followUpCount }, 'Auto follow-up enabled - would send email here');
      }

      // Schedule next follow-up if not at max
      if (followUpCount < 3 && settings.length > 0) {
        const intervalDays = settings[0].followUpIntervalDays || 7;
        await timerService.scheduleFollowUpReminder(userId, applicationId, intervalDays);
      }

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing follow-up reminder timer');
      throw error;
    }
  },
};
