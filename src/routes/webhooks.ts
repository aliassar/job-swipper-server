import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import {
  StatusUpdateWebhook,
  GenerationCompleteWebhook,
  ApplicationSubmittedWebhook,
} from '../lib/microservices';
import { notificationService } from '../services/notification.service';
import { applicationService } from '../services/application.service';
import { db } from '../lib/db';
import { applications } from '../db/schema';
import { eq } from 'drizzle-orm';

const webhooks = new Hono<AppContext>();

// Validation schemas
const statusUpdateSchema = z.object({
  applicationId: z.string().uuid(),
  userId: z.string(),
  newStage: z.enum([
    'Syncing',
    'CV Check',
    'Message Check',
    'Being Applied',
    'Applied',
    'Interview 1',
    'Next Interviews',
    'Offer',
    'Rejected',
    'Accepted',
    'Withdrawn',
    'Failed',
  ]),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

const generationCompleteSchema = z.object({
  requestId: z.string(),
  userId: z.string(),
  jobId: z.string().uuid(),
  type: z.enum(['resume', 'cover_letter']),
  success: z.boolean(),
  s3Key: z.string().optional(),
  filename: z.string().optional(),
  error: z.string().optional(),
});

const applicationSubmittedSchema = z.object({
  applicationId: z.string().uuid(),
  userId: z.string(),
  success: z.boolean(),
  submittedAt: z.string().optional(),
  confirmationId: z.string().optional(),
  error: z.string().optional(),
});

// Middleware to verify webhook signature/secret
async function verifyWebhookAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    throw new ValidationError('Unauthorized webhook request');
  }

  await next();
}

webhooks.use('*', verifyWebhookAuth);

// POST /webhooks/status-update - Receive status updates from email watcher
webhooks.post('/status-update', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = statusUpdateSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid webhook payload', validated.error.errors);
  }

  const data: StatusUpdateWebhook = validated.data;

  console.log('Received status update webhook:', data);

  // Update application stage in database
  // The validated data is guaranteed to be a valid stage enum due to the schema validation
  await applicationService.updateApplicationStage(
    data.userId,
    data.applicationId,
    data.newStage as 'Syncing' | 'CV Check' | 'Message Check' | 'Being Applied' | 'Applied' | 'Interview 1' | 'Next Interviews' | 'Offer' | 'Rejected' | 'Accepted' | 'Withdrawn' | 'Failed'
  );

  // Create notification for user
  await notificationService.createNotification(
    data.userId,
    'status_changed',
    'Application Status Updated',
    `Your application status has been updated to: ${data.newStage}`,
    { applicationId: data.applicationId, newStage: data.newStage }
  );

  return c.json(
    formatResponse(true, { message: 'Status update received' }, null, requestId)
  );
});

// POST /webhooks/generation-complete - Callbacks from AI services
webhooks.post('/generation-complete', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = generationCompleteSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid webhook payload', validated.error.errors);
  }

  const data: GenerationCompleteWebhook = validated.data;

  console.log('Received generation complete webhook:', data);

  if (data.success) {
    // Update application with generated document
    if (data.type === 'resume' && data.s3Key) {
      // Note: In a full implementation, we would create a generatedResume record
      // and link it to the application. For now, we just log this.
      console.log('Resume generated successfully:', { s3Key: data.s3Key, filename: data.filename });
    } else if (data.type === 'cover_letter' && data.s3Key) {
      // Note: In a full implementation, we would create a generatedCoverLetter record
      // and link it to the application. For now, we just log this.
      console.log('Cover letter generated successfully:', { s3Key: data.s3Key, filename: data.filename });
    }
    
    // Create notification for user
    await notificationService.createNotification(
      data.userId,
      data.type === 'resume' ? 'cv_ready' : 'message_ready',
      `${data.type === 'resume' ? 'Resume' : 'Cover Letter'} Ready`,
      `Your ${data.type === 'resume' ? 'resume' : 'cover letter'} has been generated successfully.`,
      { jobId: data.jobId, s3Key: data.s3Key, filename: data.filename }
    );
  } else {
    // Create failure notification
    await notificationService.createNotification(
      data.userId,
      'generation_failed',
      'Generation Failed',
      `Failed to generate ${data.type === 'resume' ? 'resume' : 'cover letter'}: ${data.error}`,
      { jobId: data.jobId, error: data.error }
    );
  }

  return c.json(
    formatResponse(true, { message: 'Generation webhook received' }, null, requestId)
  );
});

// POST /webhooks/application-submitted - Confirmation from application sender
webhooks.post('/application-submitted', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = applicationSubmittedSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid webhook payload', validated.error.errors);
  }

  const data: ApplicationSubmittedWebhook = validated.data;

  console.log('Received application submitted webhook:', data);

  if (data.success) {
    // Update application status to 'Applied' and set appliedAt timestamp
    await applicationService.updateApplicationStage(data.userId, data.applicationId, 'Applied');
    await db
      .update(applications)
      .set({ appliedAt: new Date(data.submittedAt || new Date().toISOString()) })
      .where(eq(applications.id, data.applicationId));
    
    // Create notification
    await notificationService.createNotification(
      data.userId,
      'status_changed',
      'Application Submitted',
      'Your application has been submitted successfully.',
      {
        applicationId: data.applicationId,
        submittedAt: data.submittedAt,
        confirmationId: data.confirmationId,
      }
    );
  } else {
    // Update application status to 'Failed'
    await applicationService.updateApplicationStage(data.userId, data.applicationId, 'Failed');
    
    // Create failure notification
    await notificationService.createNotification(
      data.userId,
      'apply_failed',
      'Application Failed',
      `Failed to submit application: ${data.error}`,
      { applicationId: data.applicationId, error: data.error }
    );
  }

  return c.json(
    formatResponse(true, { message: 'Application submission webhook received' }, null, requestId)
  );
});

export default webhooks;
