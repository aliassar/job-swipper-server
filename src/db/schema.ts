import { pgTable, pgEnum, text, timestamp, boolean, integer, jsonb, uuid, uniqueIndex } from 'drizzle-orm/pg-core';

// Enums
export const userJobStatusEnum = pgEnum('user_job_status_enum', ['pending', 'accepted', 'rejected', 'skipped']);
export const applicationStageEnum = pgEnum('application_stage_enum', [
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
]);
export const reportReasonEnum = pgEnum('report_reason_enum', ['fake', 'not_interested', 'dont_recommend_company']);
export const actionTypeEnum = pgEnum('action_type_enum', [
  'accepted',
  'rejected',
  'skipped',
  'saved',
  'unsaved',
  'rollback',
  'report',
  'unreport',
  'stage_updated',
]);
export const oauthProviderEnum = pgEnum('oauth_provider_enum', ['google', 'github', 'email', 'yahoo', 'microsoft']);
export const notificationTypeEnum = pgEnum('notification_type_enum', [
  'cv_ready',
  'message_ready',
  'status_changed',
  'follow_up_reminder',
  'verification_needed',
  'generation_failed',
  'apply_failed',
]);
export const timerTypeEnum = pgEnum('timer_type_enum', [
  'auto_apply_delay',
  'cv_verification',
  'message_verification',
  'doc_deletion',
  'follow_up_reminder',
]);
export const emailProviderEnum = pgEnum('email_provider_enum', ['gmail', 'outlook', 'yahoo', 'imap']);

// Tables

// Users table for email/password authentication
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  oauthProvider: oauthProviderEnum('oauth_provider').notNull().default('email'),
  oauthId: text('oauth_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// User profiles table for auto-apply information
export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  linkedinUrl: text('linkedin_url'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  country: text('country'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Notifications table
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Blocked companies table
export const blockedCompanies = pgTable('blocked_companies', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyName: text('company_name').notNull(),
  reason: text('reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Email connections table for OAuth tokens
export const emailConnections = pgTable('email_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: emailProviderEnum('provider').notNull(),
  email: text('email').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at'),
  imapHost: text('imap_host'),
  imapPort: integer('imap_port'),
  imapUsername: text('imap_username'),
  imapPassword: text('imap_password'),
  // Encrypted credential fields for secure storage
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  encryptedImapPassword: text('encrypted_imap_password'),
  encryptionIv: text('encryption_iv'), // Initialization Vector for AES-GCM encryption
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Scheduled timers table for delayed operations
export const scheduledTimers = pgTable('scheduled_timers', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: timerTypeEnum('type').notNull(),
  targetId: uuid('target_id').notNull(),
  executeAt: timestamp('execute_at').notNull(),
  executed: boolean('executed').notNull().default(false),
  executedAt: timestamp('executed_at'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Email verification tokens table
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// User settings table
export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('light'),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  pushNotifications: boolean('push_notifications').notNull().default(true),
  automationStages: jsonb('automation_stages').notNull().default([]),
  autoGenerateResume: boolean('auto_generate_resume').notNull().default(false),
  autoGenerateCoverLetter: boolean('auto_generate_cover_letter').notNull().default(false),
  autoGenerateEmail: boolean('auto_generate_email').notNull().default(false),
  aiFilteringEnabled: boolean('ai_filtering_enabled').notNull().default(false),
  autoApplyEnabled: boolean('auto_apply_enabled').notNull().default(false),
  writeResumeAndCoverLetter: boolean('write_resume_and_cover_letter').notNull().default(false),
  applyForMeEnabled: boolean('apply_for_me_enabled').notNull().default(false),
  verifyResumeAndCoverLetter: boolean('verify_resume_and_cover_letter').notNull().default(true),
  updateStatusForMe: boolean('update_status_for_me').notNull().default(false),
  filterOutFakeJobs: boolean('filter_out_fake_jobs').notNull().default(false),
  followUpReminderEnabled: boolean('follow_up_reminder_enabled').notNull().default(false),
  followUpIntervalDays: integer('follow_up_interval_days').notNull().default(7),
  autoFollowUpEnabled: boolean('auto_follow_up_enabled').notNull().default(false),
  baseResumeId: uuid('base_resume_id').references(() => resumeFiles.id),
  baseCoverLetterId: uuid('base_cover_letter_id'),
  baseCoverLetterUrl: text('base_cover_letter_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Resume files table
export const resumeFiles = pgTable('resume_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  fileUrl: text('file_url').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  isReference: boolean('is_reference').notNull().default(false),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Job sources table
export const jobSources = pgTable('job_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  baseUrl: text('base_url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Jobs table
export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').references(() => jobSources.id),
  externalId: text('external_id'),
  company: text('company').notNull(),
  position: text('position').notNull(),
  location: text('location'),
  salary: text('salary'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  skills: jsonb('skills').notNull().default([]),
  description: text('description'),
  requirements: text('requirements'),
  benefits: text('benefits'),
  jobType: text('job_type'),
  experienceLevel: text('experience_level'),
  jobUrl: text('job_url'),
  postedDate: timestamp('posted_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// User job status table
export const userJobStatus = pgTable('user_job_status', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  status: userJobStatusEnum('status').notNull().default('pending'),
  saved: boolean('saved').notNull().default(false),
  viewedAt: timestamp('viewed_at'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueUserJob: uniqueIndex('user_job_status_user_id_job_id_unique').on(table.userId, table.jobId),
}));

// Reported jobs table
export const reportedJobs = pgTable('reported_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  reason: reportReasonEnum('reason').notNull(),
  details: text('details'),
  reportedAt: timestamp('reported_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Applications table
export const applications = pgTable('applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  stage: applicationStageEnum('stage').notNull().default('Being Applied'),
  resumeFileId: uuid('resume_file_id').references(() => resumeFiles.id),
  generatedResumeId: uuid('generated_resume_id'),
  generatedCoverLetterId: uuid('generated_cover_letter_id'),
  generatedMessage: text('generated_message'),
  customResumeUrl: text('custom_resume_url'),
  customCoverLetterUrl: text('custom_cover_letter_url'),
  notes: text('notes'),
  autoUpdateStatus: boolean('auto_update_status').notNull().default(false),
  appliedAt: timestamp('applied_at'),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // Unique constraint to prevent duplicate applications for the same user and job
  uniqueUserJob: uniqueIndex('applications_user_id_job_id_unique').on(table.userId, table.jobId),
}));

// Workflow runs table for tracking application workflow state
export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status').notNull(),
  currentStep: text('current_step'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Follow-up tracking table
export const followUpTracking = pgTable('follow_up_tracking', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
  followUpCount: integer('follow_up_count').notNull().default(0),
  lastFollowUpAt: timestamp('last_follow_up_at'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Action history table
export const actionHistory = pgTable('action_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  actionType: actionTypeEnum('action_type').notNull(),
  previousStatus: userJobStatusEnum('previous_status'),
  newStatus: userJobStatusEnum('new_status'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Generated resumes table
export const generatedResumes = pgTable('generated_resumes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
  baseResumeId: uuid('base_resume_id').references(() => resumeFiles.id),
  fileUrl: text('file_url').notNull(),
  filename: text('filename').notNull(),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Generated cover letters table
export const generatedCoverLetters = pgTable('generated_cover_letters', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  filename: text('filename').notNull(),
  isReference: boolean('is_reference').notNull().default(false),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Sync runs table
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').notNull(),
  jobsScraped: integer('jobs_scraped').notNull().default(0),
  jobsAdded: integer('jobs_added').notNull().default(0),
  errors: jsonb('errors').notNull().default([]),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Idempotency keys table for preventing duplicate requests
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  response: jsonb('response').notNull(),
  statusCode: integer('status_code').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Unique constraint per user + key combination
  uniqueUserKey: uniqueIndex('idempotency_keys_user_id_key_unique').on(table.userId, table.key),
  // Index for cleanup job to find expired keys
  expiresAtIdx: uniqueIndex('idempotency_keys_expires_at_idx').on(table.expiresAt),
}));
