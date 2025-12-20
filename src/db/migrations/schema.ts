import { pgTable, uuid, text, jsonb, timestamp, unique, boolean, integer, foreignKey, uniqueIndex, pgEnum } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"

export const actionTypeEnum = pgEnum("action_type_enum", ['accepted', 'rejected', 'skipped', 'saved', 'unsaved', 'rollback', 'report', 'unreport', 'stage_updated'])
export const applicationStageEnum = pgEnum("application_stage_enum", ['Syncing', 'Being Applied', 'Applied', 'Phone Screen', 'Interview', 'Offer', 'Rejected', 'Accepted', 'Withdrawn', 'CV Check', 'Message Check', 'Interview 1', 'Next Interviews', 'Failed'])
export const emailProviderEnum = pgEnum("email_provider_enum", ['gmail', 'outlook', 'yahoo', 'imap'])
export const notificationTypeEnum = pgEnum("notification_type_enum", ['cv_ready', 'message_ready', 'status_changed', 'follow_up_reminder', 'verification_needed', 'generation_failed', 'apply_failed'])
export const oauthProviderEnum = pgEnum("oauth_provider_enum", ['google', 'github', 'email'])
export const reportReasonEnum = pgEnum("report_reason_enum", ['spam', 'duplicate', 'expired', 'misleading', 'other', 'fake', 'not_interested', 'dont_recommend_company'])
export const timerTypeEnum = pgEnum("timer_type_enum", ['auto_apply_delay', 'cv_verification', 'message_verification', 'doc_deletion', 'follow_up_reminder'])
export const userJobStatusEnum = pgEnum("user_job_status_enum", ['pending', 'accepted', 'rejected', 'skipped'])



export const auditLogs = pgTable("audit_logs", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: text("user_id"),
	action: text("action").notNull(),
	resource: text("resource").notNull(),
	resourceId: text("resource_id"),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	metadata: jsonb("metadata").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const jobSources = pgTable("job_sources", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	name: text("name").notNull(),
	baseUrl: text("base_url").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		jobSourcesNameUnique: unique("job_sources_name_unique").on(table.name),
	}
});

export const syncRuns = pgTable("sync_runs", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	status: text("status").notNull(),
	jobsScraped: integer("jobs_scraped").default(0).notNull(),
	jobsAdded: integer("jobs_added").default(0).notNull(),
	errors: jsonb("errors").default([]).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	email: text("email").notNull(),
	passwordHash: text("password_hash"),
	emailVerified: boolean("email_verified").default(false).notNull(),
	oauthProvider: oauthProviderEnum("oauth_provider").default('email').notNull(),
	oauthId: text("oauth_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		usersEmailUnique: unique("users_email_unique").on(table.email),
	}
});

export const blockedCompanies = pgTable("blocked_companies", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	companyName: text("company_name").notNull(),
	reason: text("reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		blockedCompaniesUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "blocked_companies_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const emailVerificationTokens = pgTable("email_verification_tokens", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	token: text("token").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	used: boolean("used").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		emailVerificationTokensUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "email_verification_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
		emailVerificationTokensTokenUnique: unique("email_verification_tokens_token_unique").on(table.token),
	}
});

export const followUpTracking = pgTable("follow_up_tracking", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	applicationId: uuid("application_id").notNull(),
	followUpCount: integer("follow_up_count").default(0).notNull(),
	lastFollowUpAt: timestamp("last_follow_up_at", { mode: 'string' }),
	nextFollowUpAt: timestamp("next_follow_up_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		followUpTrackingUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "follow_up_tracking_user_id_users_id_fk"
		}).onDelete("cascade"),
		followUpTrackingApplicationIdApplicationsIdFk: foreignKey({
			columns: [table.applicationId],
			foreignColumns: [applications.id],
			name: "follow_up_tracking_application_id_applications_id_fk"
		}).onDelete("cascade"),
	}
});

export const notifications = pgTable("notifications", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: notificationTypeEnum("type").notNull(),
	title: text("title").notNull(),
	message: text("message").notNull(),
	isRead: boolean("is_read").default(false).notNull(),
	metadata: jsonb("metadata").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		notificationsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const scheduledTimers = pgTable("scheduled_timers", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	type: timerTypeEnum("type").notNull(),
	targetId: uuid("target_id").notNull(),
	executeAt: timestamp("execute_at", { mode: 'string' }).notNull(),
	executed: boolean("executed").default(false).notNull(),
	executedAt: timestamp("executed_at", { mode: 'string' }),
	metadata: jsonb("metadata").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		scheduledTimersUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "scheduled_timers_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const userProfiles = pgTable("user_profiles", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	phone: text("phone"),
	linkedinUrl: text("linkedin_url"),
	address: text("address"),
	city: text("city"),
	state: text("state"),
	zipCode: text("zip_code"),
	country: text("country"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		userProfilesUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_profiles_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const workflowRuns = pgTable("workflow_runs", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	applicationId: uuid("application_id").notNull(),
	idempotencyKey: text("idempotency_key").notNull(),
	status: text("status").notNull(),
	currentStep: text("current_step"),
	metadata: jsonb("metadata").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		workflowRunsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "workflow_runs_user_id_users_id_fk"
		}).onDelete("cascade"),
		workflowRunsApplicationIdApplicationsIdFk: foreignKey({
			columns: [table.applicationId],
			foreignColumns: [applications.id],
			name: "workflow_runs_application_id_applications_id_fk"
		}).onDelete("cascade"),
		workflowRunsIdempotencyKeyUnique: unique("workflow_runs_idempotency_key_unique").on(table.idempotencyKey),
	}
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	token: text("token").notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	used: boolean("used").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
},
(table) => {
	return {
		passwordResetTokensUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "password_reset_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
		passwordResetTokensTokenUnique: unique("password_reset_tokens_token_unique").on(table.token),
	}
});

export const emailConnections = pgTable("email_connections", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	provider: emailProviderEnum("provider").notNull(),
	email: text("email").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	tokenExpiresAt: timestamp("token_expires_at", { mode: 'string' }),
	imapHost: text("imap_host"),
	imapPort: integer("imap_port"),
	imapUsername: text("imap_username"),
	imapPassword: text("imap_password"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	encryptedAccessToken: text("encrypted_access_token"),
	encryptedRefreshToken: text("encrypted_refresh_token"),
	encryptedImapPassword: text("encrypted_imap_password"),
	encryptionIv: text("encryption_iv"),
},
(table) => {
	return {
		emailConnectionsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "email_connections_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const jobs = pgTable("jobs", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	sourceId: uuid("source_id"),
	externalId: text("external_id"),
	company: text("company").notNull(),
	position: text("position").notNull(),
	location: text("location"),
	salary: text("salary"),
	skills: jsonb("skills").default([]).notNull(),
	description: text("description"),
	requirements: text("requirements"),
	benefits: text("benefits"),
	jobType: text("job_type"),
	experienceLevel: text("experience_level"),
	jobUrl: text("job_url"),
	postedDate: timestamp("posted_date", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	salaryMin: integer("salary_min"),
	salaryMax: integer("salary_max"),
},
(table) => {
	return {
		jobsSourceIdJobSourcesIdFk: foreignKey({
			columns: [table.sourceId],
			foreignColumns: [jobSources.id],
			name: "jobs_source_id_job_sources_id_fk"
		}),
	}
});

export const actionHistory = pgTable("action_history", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	actionType: actionTypeEnum("action_type").notNull(),
	previousStatus: userJobStatusEnum("previous_status"),
	newStatus: userJobStatusEnum("new_status"),
	metadata: jsonb("metadata").default({}).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		actionHistoryJobIdJobsIdFk: foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "action_history_job_id_jobs_id_fk"
		}).onDelete("cascade"),
		actionHistoryUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "action_history_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const applications = pgTable("applications", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	stage: applicationStageEnum("stage").default('Syncing').notNull(),
	resumeFileId: uuid("resume_file_id"),
	generatedResumeId: uuid("generated_resume_id"),
	generatedCoverLetterId: uuid("generated_cover_letter_id"),
	notes: text("notes"),
	appliedAt: timestamp("applied_at", { mode: 'string' }),
	lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	generatedMessage: text("generated_message"),
	autoUpdateStatus: boolean("auto_update_status").default(false).notNull(),
	customResumeUrl: text("custom_resume_url"),
	customCoverLetterUrl: text("custom_cover_letter_url"),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		userIdJobIdUnique: uniqueIndex("applications_user_id_job_id_unique").using("btree", table.userId.asc().nullsLast(), table.jobId.asc().nullsLast()),
		applicationsJobIdJobsIdFk: foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "applications_job_id_jobs_id_fk"
		}).onDelete("cascade"),
		applicationsResumeFileIdResumeFilesIdFk: foreignKey({
			columns: [table.resumeFileId],
			foreignColumns: [resumeFiles.id],
			name: "applications_resume_file_id_resume_files_id_fk"
		}),
		applicationsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "applications_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const generatedCoverLetters = pgTable("generated_cover_letters", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	applicationId: uuid("application_id"),
	fileUrl: text("file_url").notNull(),
	filename: text("filename").notNull(),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		generatedCoverLettersJobIdJobsIdFk: foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "generated_cover_letters_job_id_jobs_id_fk"
		}).onDelete("cascade"),
		generatedCoverLettersApplicationIdApplicationsIdFk: foreignKey({
			columns: [table.applicationId],
			foreignColumns: [applications.id],
			name: "generated_cover_letters_application_id_applications_id_fk"
		}).onDelete("cascade"),
		generatedCoverLettersUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "generated_cover_letters_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const generatedResumes = pgTable("generated_resumes", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	applicationId: uuid("application_id"),
	baseResumeId: uuid("base_resume_id"),
	fileUrl: text("file_url").notNull(),
	filename: text("filename").notNull(),
	generatedAt: timestamp("generated_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		generatedResumesJobIdJobsIdFk: foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "generated_resumes_job_id_jobs_id_fk"
		}).onDelete("cascade"),
		generatedResumesApplicationIdApplicationsIdFk: foreignKey({
			columns: [table.applicationId],
			foreignColumns: [applications.id],
			name: "generated_resumes_application_id_applications_id_fk"
		}).onDelete("cascade"),
		generatedResumesBaseResumeIdResumeFilesIdFk: foreignKey({
			columns: [table.baseResumeId],
			foreignColumns: [resumeFiles.id],
			name: "generated_resumes_base_resume_id_resume_files_id_fk"
		}),
		generatedResumesUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "generated_resumes_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const reportedJobs = pgTable("reported_jobs", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	reason: reportReasonEnum("reason").notNull(),
	details: text("details"),
	reportedAt: timestamp("reported_at", { mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		reportedJobsJobIdJobsIdFk: foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "reported_jobs_job_id_jobs_id_fk"
		}).onDelete("cascade"),
		reportedJobsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "reported_jobs_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const resumeFiles = pgTable("resume_files", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	filename: text("filename").notNull(),
	fileUrl: text("file_url").notNull(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	uploadedAt: timestamp("uploaded_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		resumeFilesUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "resume_files_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const userJobStatus = pgTable("user_job_status", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	jobId: uuid("job_id").notNull(),
	status: userJobStatusEnum("status").default('pending').notNull(),
	saved: boolean("saved").default(false).notNull(),
	viewedAt: timestamp("viewed_at", { mode: 'string' }),
	decidedAt: timestamp("decided_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
},
(table) => {
	return {
		userJobStatusJobIdJobsIdFk: foreignKey({
			columns: [table.jobId],
			foreignColumns: [jobs.id],
			name: "user_job_status_job_id_jobs_id_fk"
		}).onDelete("cascade"),
		userJobStatusUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_job_status_user_id_users_id_fk"
		}).onDelete("cascade"),
	}
});

export const userSettings = pgTable("user_settings", {
	id: uuid("id").defaultRandom().primaryKey().notNull(),
	theme: text("theme").default('light').notNull(),
	emailNotifications: boolean("email_notifications").default(true).notNull(),
	pushNotifications: boolean("push_notifications").default(true).notNull(),
	automationStages: jsonb("automation_stages").default([]).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	autoApplyEnabled: boolean("auto_apply_enabled").default(false).notNull(),
	writeResumeAndCoverLetter: boolean("write_resume_and_cover_letter").default(false).notNull(),
	applyForMeEnabled: boolean("apply_for_me_enabled").default(false).notNull(),
	verifyResumeAndCoverLetter: boolean("verify_resume_and_cover_letter").default(true).notNull(),
	updateStatusForMe: boolean("update_status_for_me").default(false).notNull(),
	filterOutFakeJobs: boolean("filter_out_fake_jobs").default(false).notNull(),
	followUpReminderEnabled: boolean("follow_up_reminder_enabled").default(false).notNull(),
	followUpIntervalDays: integer("follow_up_interval_days").default(7).notNull(),
	autoFollowUpEnabled: boolean("auto_follow_up_enabled").default(false).notNull(),
	baseResumeId: uuid("base_resume_id"),
	baseCoverLetterId: uuid("base_cover_letter_id"),
	baseCoverLetterUrl: text("base_cover_letter_url"),
	userId: uuid("user_id").notNull(),
	autoGenerateResume: boolean("auto_generate_resume").default(false).notNull(),
	autoGenerateCoverLetter: boolean("auto_generate_cover_letter").default(false).notNull(),
	autoGenerateEmail: boolean("auto_generate_email").default(false).notNull(),
	aiFilteringEnabled: boolean("ai_filtering_enabled").default(false).notNull(),
},
(table) => {
	return {
		userSettingsBaseResumeIdResumeFilesIdFk: foreignKey({
			columns: [table.baseResumeId],
			foreignColumns: [resumeFiles.id],
			name: "user_settings_base_resume_id_resume_files_id_fk"
		}),
		userSettingsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_settings_user_id_users_id_fk"
		}).onDelete("cascade"),
		userSettingsUserIdUnique: unique("user_settings_user_id_unique").on(table.userId),
	}
});