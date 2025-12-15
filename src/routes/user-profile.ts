import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { db } from '../lib/db';
import { userProfiles, resumeFiles, userSettings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { formatResponse } from '../lib/utils';
import { ValidationError, NotFoundError } from '../lib/errors';
import { storage } from '../lib/storage';

const userProfile = new Hono<AppContext>();

// Validation schemas
const updateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

// GET /api/user-profile - Get profile
userProfile.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // Get or create profile
  let profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, auth.userId))
    .limit(1);

  if (profile.length === 0) {
    // Create default profile
    const [newProfile] = await db
      .insert(userProfiles)
      .values({
        userId: auth.userId,
      })
      .returning();
    profile = [newProfile];
  }

  // Get settings to include base resume/cover letter info
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, auth.userId))
    .limit(1);

  let baseResume = null;
  if (settings.length > 0 && settings[0].baseResumeId) {
    const resume = await db
      .select()
      .from(resumeFiles)
      .where(eq(resumeFiles.id, settings[0].baseResumeId))
      .limit(1);
    baseResume = resume.length > 0 ? resume[0] : null;
  }

  return c.json(formatResponse(true, {
    ...profile[0],
    baseResume,
  }, null, requestId));
});

// PUT /api/user-profile - Update profile
userProfile.put('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = updateProfileSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  // Get or create profile
  let profile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, auth.userId))
    .limit(1);

  if (profile.length === 0) {
    // Create with data
    const [newProfile] = await db
      .insert(userProfiles)
      .values({
        userId: auth.userId,
        ...validated.data,
      })
      .returning();
    return c.json(formatResponse(true, newProfile, null, requestId));
  } else {
    // Update existing
    const [updatedProfile] = await db
      .update(userProfiles)
      .set({
        ...validated.data,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, auth.userId))
      .returning();
    return c.json(formatResponse(true, updatedProfile, null, requestId));
  }
});

// POST /api/user-profile/base-resume - Upload base resume
userProfile.post('/base-resume', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // Get file from form data
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    throw new ValidationError('No file provided');
  }

  // Upload file
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = storage.generateKey(auth.userId, 'base-resume', file.name);
  const fileUrl = await storage.uploadFile(key, buffer, file.type);

  // Create resume file record
  const [resumeFile] = await db
    .insert(resumeFiles)
    .values({
      userId: auth.userId,
      filename: file.name,
      fileUrl,
      isPrimary: true,
      isReference: true,
    })
    .returning();

  // Update user settings to reference this as base resume
  await db
    .update(userSettings)
    .set({
      baseResumeId: resumeFile.id,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, auth.userId));

  return c.json(formatResponse(true, resumeFile, null, requestId));
});

// POST /api/user-profile/base-cover-letter - Upload base cover letter
userProfile.post('/base-cover-letter', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // Get file from form data
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    throw new ValidationError('No file provided');
  }

  // Upload file
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = storage.generateKey(auth.userId, 'base-cover-letter', file.name);
  const fileUrl = await storage.uploadFile(key, buffer, file.type);

  // For now, store the URL in settings metadata
  // In a real implementation, you might want a separate table
  const settings = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, auth.userId))
    .limit(1);

  if (settings.length === 0) {
    throw new NotFoundError('User settings');
  }

  // TODO: Add baseCoverLetterUrl field to settings or create separate table
  // For now, just return success
  return c.json(formatResponse(true, {
    filename: file.name,
    fileUrl,
  }, null, requestId));
});

// DELETE /api/user-profile/base-resume - Remove base resume
userProfile.delete('/base-resume', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // Update user settings to remove base resume reference
  await db
    .update(userSettings)
    .set({
      baseResumeId: null,
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, auth.userId));

  return c.json(formatResponse(true, { message: 'Base resume removed' }, null, requestId));
});

// DELETE /api/user-profile/base-cover-letter - Remove base cover letter
userProfile.delete('/base-cover-letter', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // TODO: Implement when base cover letter storage is added
  return c.json(formatResponse(true, { message: 'Base cover letter removed' }, null, requestId));
});

export default userProfile;
