/**
 * Shared type definitions for Job Swiper API
 * These types should be kept in sync with the frontend
 */

/**
 * Application stages in the job application workflow
 * @sync This enum must match the frontend constants in lib/constants.js
 */
export const APPLICATION_STAGES = [
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
] as const;

export type ApplicationStage = typeof APPLICATION_STAGES[number];

/**
 * User job status values
 */
export const USER_JOB_STATUSES = ['pending', 'accepted', 'rejected', 'skipped'] as const;
export type UserJobStatus = typeof USER_JOB_STATUSES[number];

/**
 * Report reasons for flagging jobs
 */
export const REPORT_REASONS = ['fake', 'not_interested', 'dont_recommend_company'] as const;
export type ReportReason = typeof REPORT_REASONS[number];

/**
 * Notification types
 */
export const NOTIFICATION_TYPES = [
  'cv_ready',
  'message_ready',
  'status_changed',
  'follow_up_reminder',
  'verification_needed',
  'generation_failed',
  'apply_failed',
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
