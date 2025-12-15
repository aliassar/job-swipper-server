/**
 * Microservice API Contracts
 * 
 * This file defines TypeScript interfaces for all microservice communication
 * to ensure type safety and consistency across the application.
 */

// ==================== Resume AI Service ====================

export interface ResumeAIRequest {
  baseResumeS3Key: string;
  jobDescription: string;
  jobId: string;
  userId: string;
  requestId: string;
}

export interface ResumeAIResponse {
  success: boolean;
  resumeS3Key?: string;
  filename?: string;
  error?: string;
}

// ==================== Cover Letter AI Service ====================

export interface UserProfile {
  firstName?: string;
  lastName?: string;
  phone?: string;
  linkedinUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface CoverLetterAIRequest {
  baseCoverLetterS3Key?: string;
  jobDescription: string;
  jobId: string;
  userId: string;
  userProfile: UserProfile;
  requestId: string;
}

export interface CoverLetterAIResponse {
  success: boolean;
  coverLetterS3Key?: string;
  filename?: string;
  error?: string;
}

// ==================== Application Sender Service ====================

export type ApplyMethod = 'email' | 'form';

export interface ApplicationSenderRequest {
  applicationId: string;
  resumeS3Key?: string;
  coverLetterS3Key?: string;
  message?: string;
  userProfile: UserProfile;
  applyMethod: ApplyMethod;
  applyUrl?: string;
  applyEmail?: string;
}

export interface ApplicationSenderResponse {
  success: boolean;
  submittedAt?: string;
  confirmationId?: string;
  error?: string;
}

// ==================== Job Filter Service ====================

export type FilterType = 'fake' | 'not_interested' | 'company_block';

export interface JobFilterRequest {
  jobId: string;
  userId: string;
  filterType: FilterType;
  companyName: string;
  jobDetails: {
    position: string;
    description?: string;
    requirements?: string;
    location?: string;
  };
}

export interface JobFilterResponse {
  success: boolean;
  filtered: boolean;
  reason?: string;
  error?: string;
}

// ==================== Webhook Payloads ====================

export interface StatusUpdateWebhook {
  applicationId: string;
  userId: string;
  newStage: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface GenerationCompleteWebhook {
  requestId: string;
  userId: string;
  jobId: string;
  type: 'resume' | 'cover_letter';
  success: boolean;
  s3Key?: string;
  filename?: string;
  error?: string;
}

export interface ApplicationSubmittedWebhook {
  applicationId: string;
  userId: string;
  success: boolean;
  submittedAt?: string;
  confirmationId?: string;
  error?: string;
}

// ==================== Stage Updater Service ====================

export type EmailProvider = 'gmail' | 'yahoo' | 'outlook' | 'imap';

export interface EmailCredentials {
  email: string;
  accessToken?: string;
  refreshToken?: string;
  imapServer?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
}

export interface StageUpdaterCredentialsRequest {
  userId: string;
  provider: EmailProvider;
  credentials: EmailCredentials;
}

export interface StageUpdaterCredentialsResponse {
  success: boolean;
  message?: string;
  error?: string;
}
