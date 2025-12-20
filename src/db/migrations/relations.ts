import { relations } from "drizzle-orm/relations";
import { users, blockedCompanies, emailVerificationTokens, followUpTracking, applications, notifications, scheduledTimers, userProfiles, workflowRuns, passwordResetTokens, emailConnections, jobSources, jobs, actionHistory, resumeFiles, generatedCoverLetters, generatedResumes, reportedJobs, userJobStatus, userSettings } from "./schema";

export const blockedCompaniesRelations = relations(blockedCompanies, ({one}) => ({
	user: one(users, {
		fields: [blockedCompanies.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	blockedCompanies: many(blockedCompanies),
	emailVerificationTokens: many(emailVerificationTokens),
	followUpTrackings: many(followUpTracking),
	notifications: many(notifications),
	scheduledTimers: many(scheduledTimers),
	userProfiles: many(userProfiles),
	workflowRuns: many(workflowRuns),
	passwordResetTokens: many(passwordResetTokens),
	emailConnections: many(emailConnections),
	actionHistories: many(actionHistory),
	applications: many(applications),
	generatedCoverLetters: many(generatedCoverLetters),
	generatedResumes: many(generatedResumes),
	reportedJobs: many(reportedJobs),
	resumeFiles: many(resumeFiles),
	userJobStatuses: many(userJobStatus),
	userSettings: many(userSettings),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({one}) => ({
	user: one(users, {
		fields: [emailVerificationTokens.userId],
		references: [users.id]
	}),
}));

export const followUpTrackingRelations = relations(followUpTracking, ({one}) => ({
	user: one(users, {
		fields: [followUpTracking.userId],
		references: [users.id]
	}),
	application: one(applications, {
		fields: [followUpTracking.applicationId],
		references: [applications.id]
	}),
}));

export const applicationsRelations = relations(applications, ({one, many}) => ({
	followUpTrackings: many(followUpTracking),
	workflowRuns: many(workflowRuns),
	job: one(jobs, {
		fields: [applications.jobId],
		references: [jobs.id]
	}),
	resumeFile: one(resumeFiles, {
		fields: [applications.resumeFileId],
		references: [resumeFiles.id]
	}),
	user: one(users, {
		fields: [applications.userId],
		references: [users.id]
	}),
	generatedCoverLetters: many(generatedCoverLetters),
	generatedResumes: many(generatedResumes),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.userId],
		references: [users.id]
	}),
}));

export const scheduledTimersRelations = relations(scheduledTimers, ({one}) => ({
	user: one(users, {
		fields: [scheduledTimers.userId],
		references: [users.id]
	}),
}));

export const userProfilesRelations = relations(userProfiles, ({one}) => ({
	user: one(users, {
		fields: [userProfiles.userId],
		references: [users.id]
	}),
}));

export const workflowRunsRelations = relations(workflowRuns, ({one}) => ({
	user: one(users, {
		fields: [workflowRuns.userId],
		references: [users.id]
	}),
	application: one(applications, {
		fields: [workflowRuns.applicationId],
		references: [applications.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const emailConnectionsRelations = relations(emailConnections, ({one}) => ({
	user: one(users, {
		fields: [emailConnections.userId],
		references: [users.id]
	}),
}));

export const jobsRelations = relations(jobs, ({one, many}) => ({
	jobSource: one(jobSources, {
		fields: [jobs.sourceId],
		references: [jobSources.id]
	}),
	actionHistories: many(actionHistory),
	applications: many(applications),
	generatedCoverLetters: many(generatedCoverLetters),
	generatedResumes: many(generatedResumes),
	reportedJobs: many(reportedJobs),
	userJobStatuses: many(userJobStatus),
}));

export const jobSourcesRelations = relations(jobSources, ({many}) => ({
	jobs: many(jobs),
}));

export const actionHistoryRelations = relations(actionHistory, ({one}) => ({
	job: one(jobs, {
		fields: [actionHistory.jobId],
		references: [jobs.id]
	}),
	user: one(users, {
		fields: [actionHistory.userId],
		references: [users.id]
	}),
}));

export const resumeFilesRelations = relations(resumeFiles, ({one, many}) => ({
	applications: many(applications),
	generatedResumes: many(generatedResumes),
	user: one(users, {
		fields: [resumeFiles.userId],
		references: [users.id]
	}),
	userSettings: many(userSettings),
}));

export const generatedCoverLettersRelations = relations(generatedCoverLetters, ({one}) => ({
	job: one(jobs, {
		fields: [generatedCoverLetters.jobId],
		references: [jobs.id]
	}),
	application: one(applications, {
		fields: [generatedCoverLetters.applicationId],
		references: [applications.id]
	}),
	user: one(users, {
		fields: [generatedCoverLetters.userId],
		references: [users.id]
	}),
}));

export const generatedResumesRelations = relations(generatedResumes, ({one}) => ({
	job: one(jobs, {
		fields: [generatedResumes.jobId],
		references: [jobs.id]
	}),
	application: one(applications, {
		fields: [generatedResumes.applicationId],
		references: [applications.id]
	}),
	resumeFile: one(resumeFiles, {
		fields: [generatedResumes.baseResumeId],
		references: [resumeFiles.id]
	}),
	user: one(users, {
		fields: [generatedResumes.userId],
		references: [users.id]
	}),
}));

export const reportedJobsRelations = relations(reportedJobs, ({one}) => ({
	job: one(jobs, {
		fields: [reportedJobs.jobId],
		references: [jobs.id]
	}),
	user: one(users, {
		fields: [reportedJobs.userId],
		references: [users.id]
	}),
}));

export const userJobStatusRelations = relations(userJobStatus, ({one}) => ({
	job: one(jobs, {
		fields: [userJobStatus.jobId],
		references: [jobs.id]
	}),
	user: one(users, {
		fields: [userJobStatus.userId],
		references: [users.id]
	}),
}));

export const userSettingsRelations = relations(userSettings, ({one}) => ({
	resumeFile: one(resumeFiles, {
		fields: [userSettings.baseResumeId],
		references: [resumeFiles.id]
	}),
	user: one(users, {
		fields: [userSettings.userId],
		references: [users.id]
	}),
}));