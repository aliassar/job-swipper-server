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

const webhooks = new Hono<AppContext>();

// Validation schemas
const statusUpdateSchema = z.object({
  applicationId: z.string().uuid(),
  userId: z.string(),
  newStage: z.string(),
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

  // TODO: Update application stage in database
  console.log('Received status update webhook:', data);

  // TODO: Create notification for user
  // await notificationService.createNotification({
  //   userId: data.userId,
  //   type: 'status_changed',
  //   title: 'Application Status Updated',
  //   message: `Your application status has been updated to: ${data.newStage}`,
  //   metadata: { applicationId: data.applicationId, newStage: data.newStage },
  // });

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
    // TODO: Update application with generated document
    // TODO: Create notification for user
    // await notificationService.createNotification({
    //   userId: data.userId,
    //   type: data.type === 'resume' ? 'cv_ready' : 'message_ready',
    //   title: `${data.type === 'resume' ? 'Resume' : 'Cover Letter'} Ready`,
    //   message: `Your ${data.type === 'resume' ? 'resume' : 'cover letter'} has been generated successfully.`,
    //   metadata: { jobId: data.jobId, s3Key: data.s3Key, filename: data.filename },
    // });
  } else {
    // TODO: Create failure notification
    // await notificationService.createNotification({
    //   userId: data.userId,
    //   type: 'generation_failed',
    //   title: 'Generation Failed',
    //   message: `Failed to generate ${data.type === 'resume' ? 'resume' : 'cover letter'}: ${data.error}`,
    //   metadata: { jobId: data.jobId, error: data.error },
    // });
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
    // TODO: Update application status to 'Applied'
    // TODO: Set appliedAt timestamp
    // TODO: Create notification
    // await notificationService.createNotification({
    //   userId: data.userId,
    //   type: 'status_changed',
    //   title: 'Application Submitted',
    //   message: 'Your application has been submitted successfully.',
    //   metadata: {
    //     applicationId: data.applicationId,
    //     submittedAt: data.submittedAt,
    //     confirmationId: data.confirmationId,
    //   },
    // });
  } else {
    // TODO: Update application status to 'Failed'
    // TODO: Create failure notification
    // await notificationService.createNotification({
    //   userId: data.userId,
    //   type: 'apply_failed',
    //   title: 'Application Failed',
    //   message: `Failed to submit application: ${data.error}`,
    //   metadata: { applicationId: data.applicationId, error: data.error },
    // });
  }

  return c.json(
    formatResponse(true, { message: 'Application submission webhook received' }, null, requestId)
  );
});

export default webhooks;
