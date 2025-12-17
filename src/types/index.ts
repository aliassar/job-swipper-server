import { Context } from 'hono';

export * from './shared';

export interface AuthContext {
  userId: string;
  sessionToken: string;
}

export interface AppContext {
  Variables: {
    auth: AuthContext;
    requestId: string;
  };
}

export type AppContextType = Context<AppContext>;

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: object;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

// Job-related types
export interface JobWithStatus {
  id: string;
  company: string;
  position: string;
  location: string | null;
  salary: string | null;
  skills: string[];
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  jobType: string | null;
  experienceLevel: string | null;
  jobUrl: string | null;
  postedDate: Date | null;
  status: 'pending' | 'accepted' | 'rejected' | 'skipped';
  saved: boolean;
  viewedAt: Date | null;
  decidedAt: Date | null;
}

// Application-related types
export interface ApplicationWithJob {
  id: string;
  stage: string;
  notes: string | null;
  appliedAt: Date | null;
  lastUpdated: Date;
  job: {
    id: string;
    company: string;
    position: string;
    location: string | null;
  };
}

// History-related types
export interface ActionHistoryItem {
  id: string;
  actionType: string;
  previousStatus: string | null;
  newStatus: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  job: {
    id: string;
    company: string;
    position: string;
  };
}

// Settings-related types
export interface UserSettingsData {
  theme: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  automationStages: string[];
}

// Resume-related types
export interface ResumeFileData {
  id: string;
  filename: string;
  fileUrl: string;
  isPrimary: boolean;
  uploadedAt: Date;
}

// Generation-related types
export interface GeneratedResumeData {
  id: string;
  jobId: string;
  filename: string;
  fileUrl: string;
  generatedAt: Date;
  job: {
    company: string;
    position: string;
  };
}

export interface GeneratedCoverLetterData {
  id: string;
  jobId: string;
  filename: string;
  fileUrl: string;
  generatedAt: Date;
  job: {
    company: string;
    position: string;
  };
}

// Sync-related types
export interface SyncStatus {
  id: string;
  status: string;
  jobsScraped: number;
  jobsAdded: number;
  errors: unknown[];
  startedAt: Date;
  completedAt: Date | null;
}
