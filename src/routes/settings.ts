import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { db } from '../lib/db';
import { userSettings } from '../db/schema';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';
import { eq } from 'drizzle-orm';

const settings = new Hono<AppContext>();

// Validation schemas
const updateSettingsSchema = z.object({
  theme: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  automationStages: z.array(z.string()).optional(),
  autoGenerateResume: z.boolean().optional(),
  autoGenerateCoverLetter: z.boolean().optional(),
  autoGenerateEmail: z.boolean().optional(),
  aiFilteringEnabled: z.boolean().optional(),
  autoApplyEnabled: z.boolean().optional(),
  writeResumeAndCoverLetter: z.boolean().optional(),
  applyForMeEnabled: z.boolean().optional(),
  verifyResumeAndCoverLetter: z.boolean().optional(),
  updateStatusForMe: z.boolean().optional(),
  filterOutFakeJobs: z.boolean().optional(),
  followUpReminderEnabled: z.boolean().optional(),
  followUpIntervalDays: z.number().min(1).max(90).optional(),
  autoFollowUpEnabled: z.boolean().optional(),
  baseResumeId: z.string().uuid().nullable().optional(),
  baseCoverLetterId: z.string().uuid().nullable().optional(),
  baseCoverLetterUrl: z.string().nullable().optional(),
});

// GET /api/settings - Get user settings
settings.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  let result = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, auth.userId))
    .limit(1);

  // Create default settings if not exist
  if (result.length === 0) {
    const created = await db
      .insert(userSettings)
      .values({
        userId: auth.userId,
      })
      .returning();
    result = created;
  }

  return c.json(formatResponse(true, result[0], null, requestId));
});

// PUT /api/settings - Update user settings
settings.put('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = updateSettingsSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  // Ensure settings exist
  let existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, auth.userId))
    .limit(1);

  if (existing.length === 0) {
    existing = await db
      .insert(userSettings)
      .values({
        userId: auth.userId,
      })
      .returning();
  }

  // Update settings
  const updated = await db
    .update(userSettings)
    .set({
      ...validated.data,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, auth.userId))
    .returning();

  return c.json(formatResponse(true, updated[0], null, requestId));
});

export default settings;
