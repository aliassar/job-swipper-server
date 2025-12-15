import { db } from '../lib/db';
import { workflowRuns, applications, userSettings, jobs, userProfiles } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';
import { logger } from '../middleware/logger';
import { timerService } from './timer.service';
import { applicationService } from './application.service';
import { generationService } from './generation.service';
import { resumeService } from './resume.service';
import { notificationService } from './notification.service';
import { applicationSenderClient } from '../lib/microservice-client';
import type { ApplicationSenderRequest, ApplicationSenderResponse, UserProfile } from '../lib/microservices';

export type WorkflowStatus = 'pending' | 'generating_resume' | 'generating_cover_letter' | 'waiting_cv_verification' | 'waiting_message_verification' | 'applying' | 'completed' | 'failed' | 'cancelled';

export const workflowService = {
  /**
   * Create a new workflow run
   */
  async createWorkflowRun(userId: string, applicationId: string, jobId: string): Promise<any> {
    // Use deterministic idempotency key to prevent duplicate workflows
    const idempotencyKey = `workflow-${userId}-${applicationId}`;
    
    // Check if workflow already exists
    const existing = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      logger.info({ workflowRunId: existing[0].id, applicationId }, 'Workflow run already exists, returning existing');
      return existing[0];
    }

    const [workflowRun] = await db
      .insert(workflowRuns)
      .values({
        userId,
        applicationId,
        idempotencyKey,
        status: 'pending',
        currentStep: 'initialized',
        metadata: { jobId },
      })
      .returning();

    logger.info({ workflowRunId: workflowRun.id, applicationId }, 'Workflow run created');
    return workflowRun;
  },

  /**
   * Get workflow run by application ID
   */
  async getWorkflowByApplication(applicationId: string): Promise<any | null> {
    const result = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.applicationId, applicationId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  },

  /**
   * Get workflow run by ID
   */
  async getWorkflowRun(workflowRunId: string): Promise<any> {
    const result = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, workflowRunId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Workflow run');
    }

    return result[0];
  },

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(
    workflowRunId: string,
    status: WorkflowStatus,
    errorMessage?: string
  ): Promise<void> {
    const workflowRun = await this.getWorkflowRun(workflowRunId);
    
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (errorMessage) {
      // Merge error into existing metadata
      updateData.metadata = {
        ...workflowRun.metadata,
        error: errorMessage,
      };
    }

    await db
      .update(workflowRuns)
      .set(updateData)
      .where(eq(workflowRuns.id, workflowRunId));

    logger.info({ workflowRunId, status, errorMessage }, 'Workflow status updated');
  },

  /**
   * Update workflow step
   */
  async updateWorkflowStep(workflowRunId: string, step: string): Promise<void> {
    await db
      .update(workflowRuns)
      .set({
        currentStep: step,
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, workflowRunId));
  },

  /**
   * Check if application has an auto-apply workflow run
   */
  async hasAutoApplyRun(applicationId: string): Promise<boolean> {
    const result = await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.applicationId, applicationId),
          eq(workflowRuns.status, 'pending')
        )
      )
      .limit(1);

    return result.length > 0;
  },

  /**
   * Cancel workflow
   */
  async cancelWorkflow(workflowRunId: string): Promise<void> {
    await db
      .update(workflowRuns)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, workflowRunId));

    logger.info({ workflowRunId }, 'Workflow cancelled');
  },

  /**
   * Process workflow - main orchestration logic
   */
  async processWorkflow(workflowRunId: string): Promise<void> {
    try {
      const workflowRun = await this.getWorkflowRun(workflowRunId);
      
      // Check if workflow was cancelled
      if (workflowRun.status === 'cancelled') {
        logger.info({ workflowRunId }, 'Workflow was cancelled, skipping processing');
        return;
      }

      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, workflowRun.applicationId))
        .limit(1);

      if (application.length === 0) {
        throw new NotFoundError('Application');
      }

      const app = application[0];
      const userId = workflowRun.userId;
      const jobId = workflowRun.metadata.jobId as string;

      // Get user settings
      const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      if (settings.length === 0) {
        throw new Error('User settings not found');
      }

      const userPrefs = settings[0];

      // Step 1: Generate resume if enabled
      if (userPrefs.writeResumeAndCoverLetter && userPrefs.autoGenerateResume) {
        await this.updateWorkflowStatus(workflowRunId, 'generating_resume');
        await this.updateWorkflowStep(workflowRunId, 'generating_resume');

        try {
          const referenceResume = await resumeService.getReferenceResume(userId);
          if (referenceResume) {
            const generatedResume = await generationService.generateResume(
              userId,
              jobId,
              referenceResume.id
            );

            await db
              .update(applications)
              .set({ generatedResumeId: generatedResume.id })
              .where(eq(applications.id, app.id));

            // Update stage to CV Check
            await applicationService.updateApplicationStage(userId, app.id, 'CV Check');

            // Notify user
            await notificationService.createNotification(
              userId,
              'cv_ready',
              'Resume Generated',
              'Your resume has been generated and is ready for verification.',
              { applicationId: app.id }
            );

            // Schedule CV verification timeout if needed
            if (userPrefs.verifyResumeAndCoverLetter) {
              await timerService.scheduleCvVerificationTimer(userId, app.id);
              await this.updateWorkflowStatus(workflowRunId, 'waiting_cv_verification');
              return; // Wait for user verification
            }
          }
        } catch (error) {
          logger.error({ error, workflowRunId }, 'Failed to generate resume');
          await this.updateWorkflowStatus(workflowRunId, 'failed', 'Failed to generate resume');
          await applicationService.updateApplicationStage(userId, app.id, 'Failed');
          await notificationService.createNotification(
            userId,
            'generation_failed',
            'Resume Generation Failed',
            'Failed to generate your resume. Please try again.',
            { applicationId: app.id, error: String(error) }
          );
          return;
        }
      }

      // Step 2: Generate cover letter if enabled
      if (userPrefs.writeResumeAndCoverLetter && userPrefs.autoGenerateCoverLetter) {
        await this.updateWorkflowStatus(workflowRunId, 'generating_cover_letter');
        await this.updateWorkflowStep(workflowRunId, 'generating_cover_letter');

        try {
          const generatedCoverLetter = await generationService.generateCoverLetter(
            userId,
            jobId
          );

          await db
            .update(applications)
            .set({ generatedCoverLetterId: generatedCoverLetter.id })
            .where(eq(applications.id, app.id));

          // Update stage to Message Check if not already there
          if (app.stage !== 'CV Check') {
            await applicationService.updateApplicationStage(userId, app.id, 'Message Check');
          }

          // Notify user
          await notificationService.createNotification(
            userId,
            'message_ready',
            'Cover Letter Generated',
            'Your cover letter has been generated and is ready for verification.',
            { applicationId: app.id }
          );

          // Schedule message verification timeout if needed
          if (userPrefs.verifyResumeAndCoverLetter) {
            await timerService.scheduleMessageVerificationTimer(userId, app.id);
            await this.updateWorkflowStatus(workflowRunId, 'waiting_message_verification');
            return; // Wait for user verification
          }
        } catch (error) {
          logger.error({ error, workflowRunId }, 'Failed to generate cover letter');
          await this.updateWorkflowStatus(workflowRunId, 'failed', 'Failed to generate cover letter');
          await applicationService.updateApplicationStage(userId, app.id, 'Failed');
          await notificationService.createNotification(
            userId,
            'generation_failed',
            'Cover Letter Generation Failed',
            'Failed to generate your cover letter. Please try again.',
            { applicationId: app.id, error: String(error) }
          );
          return;
        }
      }

      // Step 3: Apply for job if auto-apply is enabled
      if (userPrefs.applyForMeEnabled) {
        await this.updateWorkflowStatus(workflowRunId, 'applying');
        await this.updateWorkflowStep(workflowRunId, 'applying');
        await applicationService.updateApplicationStage(userId, app.id, 'Being Applied');

        try {
          // Get job details
          const [jobDetails] = await db
            .select()
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1);

          if (!jobDetails) {
            throw new Error('Job not found');
          }

          // Get user profile
          const [profile] = await db
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.userId, userId))
            .limit(1);

          const userProfile: UserProfile = profile ? {
            firstName: profile.firstName || undefined,
            lastName: profile.lastName || undefined,
            phone: profile.phone || undefined,
            linkedinUrl: profile.linkedinUrl || undefined,
            address: profile.address || undefined,
            city: profile.city || undefined,
            state: profile.state || undefined,
            zipCode: profile.zipCode || undefined,
            country: profile.country || undefined,
          } : {};

          // Get generated documents
          const updatedApp = await db
            .select()
            .from(applications)
            .where(eq(applications.id, app.id))
            .limit(1);

          const appData = updatedApp[0];

          // Call application sender microservice
          if (process.env.APPLICATION_SENDER_SERVICE_URL) {
            const request: ApplicationSenderRequest = {
              applicationId: app.id,
              resumeS3Key: appData.generatedResumeId ? undefined : undefined, // Would need to get actual S3 key
              coverLetterS3Key: appData.generatedCoverLetterId ? undefined : undefined, // Would need to get actual S3 key
              userProfile,
              applyMethod: 'email', // Default to email, could be determined from job details
              applyEmail: jobDetails.jobUrl || undefined, // Would need proper email extraction
            };

            const response = await applicationSenderClient.request<ApplicationSenderResponse>(
              '/apply',
              {
                method: 'POST',
                body: request,
              }
            );

            if (response.success) {
              await applicationService.updateApplicationStage(userId, app.id, 'Applied');
              await db
                .update(applications)
                .set({ appliedAt: new Date() })
                .where(eq(applications.id, app.id));

              logger.info({ applicationId: app.id, workflowRunId }, 'Application submitted via microservice');
            } else {
              throw new Error(response.error || 'Application submission failed');
            }
          } else {
            // Fallback if microservice not configured - just mark as Applied
            logger.warn({ applicationId: app.id }, 'Application sender microservice not configured, marking as Applied');
            await applicationService.updateApplicationStage(userId, app.id, 'Applied');
            await db
              .update(applications)
              .set({ appliedAt: new Date() })
              .where(eq(applications.id, app.id));
          }
        } catch (error) {
          logger.error({ error, workflowRunId, applicationId: app.id }, 'Failed to submit application');
          await this.updateWorkflowStatus(workflowRunId, 'failed', 'Failed to submit application');
          await applicationService.updateApplicationStage(userId, app.id, 'Failed');
          await notificationService.createNotification(
            userId,
            'apply_failed',
            'Application Submission Failed',
            'Failed to submit your application. Please try again manually.',
            { applicationId: app.id, error: String(error) }
          );
          return;
        }
      }

      // Workflow completed
      await this.updateWorkflowStatus(workflowRunId, 'completed');
      logger.info({ workflowRunId }, 'Workflow completed successfully');

    } catch (error) {
      logger.error({ error, workflowRunId }, 'Workflow processing failed');
      await this.updateWorkflowStatus(workflowRunId, 'failed', String(error));
      throw error;
    }
  },
};
