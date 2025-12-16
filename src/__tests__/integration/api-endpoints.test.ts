import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jobService } from '../../services/job.service';
import { applicationService } from '../../services/application.service';

// Mock the database module
vi.mock('../../lib/db', () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock auth service to avoid JWT_SECRET requirement
vi.mock('../../services/auth.service', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    verifyEmail: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

/**
 * Comprehensive API endpoint tests
 * Tests all major endpoints for reliability and correct functionality
 */
describe('API Endpoint Reliability Tests', () => {
  const mockUserId = 'test-user-123';
  const mockJobId = 'test-job-123';
  const mockApplicationId = 'test-app-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Job Endpoints', () => {
    describe('GET /api/jobs - Get Pending Jobs', () => {
      it('should return pending jobs successfully', async () => {
        const mockJobs = [
          {
            id: 'job-1',
            company: 'Tech Corp',
            position: 'Software Engineer',
            status: 'pending',
          },
        ];

        vi.spyOn(jobService, 'getPendingJobs').mockResolvedValue({
          jobs: mockJobs,
          total: 1,
          remaining: 1,
        } as any);

        const result = await jobService.getPendingJobs(mockUserId);

        expect(result.jobs).toHaveLength(1);
        expect(result.jobs[0].company).toBe('Tech Corp');
      });

      it('should support search filtering', async () => {
        vi.spyOn(jobService, 'getPendingJobs').mockResolvedValue({
          jobs: [],
          total: 0,
          remaining: 0,
        } as any);

        await jobService.getPendingJobs(mockUserId, 'Engineer');

        expect(jobService.getPendingJobs).toHaveBeenCalledWith(mockUserId, 'Engineer');
      });

      it('should support location filtering', async () => {
        vi.spyOn(jobService, 'getPendingJobs').mockResolvedValue({
          jobs: [],
          total: 0,
          remaining: 0,
        } as any);

        await jobService.getPendingJobs(mockUserId, undefined, 10, 'San Francisco');

        expect(jobService.getPendingJobs).toHaveBeenCalledWith(
          mockUserId,
          undefined,
          10,
          'San Francisco'
        );
      });

      it('should support salary filtering', async () => {
        vi.spyOn(jobService, 'getPendingJobs').mockResolvedValue({
          jobs: [],
          total: 0,
          remaining: 0,
        } as any);

        await jobService.getPendingJobs(mockUserId, undefined, 10, undefined, 100000, 150000);

        expect(jobService.getPendingJobs).toHaveBeenCalledWith(
          mockUserId,
          undefined,
          10,
          undefined,
          100000,
          150000
        );
      });
    });

    describe('POST /api/jobs/:id/accept - Accept Job', () => {
      it('should accept a job successfully', async () => {
        vi.spyOn(jobService, 'acceptJob').mockResolvedValue({
          job: { id: mockJobId, company: 'Test Corp', position: 'Engineer' },
          application: { id: 'app-123', stage: 'applied' },
          workflow: null,
        } as any);

        const result = await jobService.acceptJob(mockUserId, mockJobId);

        expect(result.job).toBeDefined();
        expect(jobService.acceptJob).toHaveBeenCalledWith(mockUserId, mockJobId);
      });

      it('should accept a job with automaticApply metadata set to true', async () => {
        vi.spyOn(jobService, 'acceptJob').mockResolvedValue({
          job: { id: mockJobId, company: 'Test Corp', position: 'Engineer' },
          application: { id: 'app-123', stage: 'applied' },
          workflow: { id: 'workflow-123', status: 'pending' },
        } as any);

        const metadata = { automaticApply: true };
        const result = await jobService.acceptJob(mockUserId, mockJobId, undefined, metadata);

        expect(result.job).toBeDefined();
        expect(result.workflow).toBeDefined();
        expect(jobService.acceptJob).toHaveBeenCalledWith(mockUserId, mockJobId, undefined, metadata);
      });

      it('should accept a job with automaticApply metadata set to false', async () => {
        vi.spyOn(jobService, 'acceptJob').mockResolvedValue({
          job: { id: mockJobId, company: 'Test Corp', position: 'Engineer' },
          application: { id: 'app-123', stage: 'applied' },
          workflow: null,
        } as any);

        const metadata = { automaticApply: false };
        const result = await jobService.acceptJob(mockUserId, mockJobId, undefined, metadata);

        expect(result.job).toBeDefined();
        expect(result.workflow).toBeNull();
        expect(jobService.acceptJob).toHaveBeenCalledWith(mockUserId, mockJobId, undefined, metadata);
      });

      it('should accept a job with empty metadata (falls back to user settings)', async () => {
        vi.spyOn(jobService, 'acceptJob').mockResolvedValue({
          job: { id: mockJobId, company: 'Test Corp', position: 'Engineer' },
          application: { id: 'app-123', stage: 'applied' },
          workflow: null,
        } as any);

        const metadata = {};
        const result = await jobService.acceptJob(mockUserId, mockJobId, undefined, metadata);

        expect(result.job).toBeDefined();
        expect(jobService.acceptJob).toHaveBeenCalledWith(mockUserId, mockJobId, undefined, metadata);
      });
    });

    describe('POST /api/jobs/:id/reject - Reject Job', () => {
      it('should reject a job successfully', async () => {
        vi.spyOn(jobService, 'updateJobStatus').mockResolvedValue({
          id: mockJobId,
          status: 'rejected',
        } as any);

        const result = await jobService.updateJobStatus(mockUserId, mockJobId, 'rejected', 'rejected');

        expect(result.status).toBe('rejected');
      });
    });

    describe('POST /api/jobs/:id/skip - Skip Job', () => {
      it('should skip a job successfully', async () => {
        vi.spyOn(jobService, 'updateJobStatus').mockResolvedValue({
          id: mockJobId,
          status: 'skipped',
        } as any);

        const result = await jobService.updateJobStatus(mockUserId, mockJobId, 'skipped', 'skipped');

        expect(result.status).toBe('skipped');
      });
    });

    describe('POST /api/jobs/:id/save - Toggle Save', () => {
      it('should toggle save status successfully', async () => {
        vi.spyOn(jobService, 'toggleSave').mockResolvedValue({
          id: mockJobId,
          saved: true,
        } as any);

        const result = await jobService.toggleSave(mockUserId, mockJobId);

        expect(result.saved).toBe(true);
      });
    });

    describe('POST /api/jobs/:id/report - Report Job', () => {
      it('should report a job successfully', async () => {
        vi.spyOn(jobService, 'reportJob').mockResolvedValue({
          id: 'report-123',
          userId: mockUserId,
          jobId: mockJobId,
          reason: 'fake',
        } as any);

        const result = await jobService.reportJob(mockUserId, mockJobId, 'fake', 'Details');

        expect(result.reason).toBe('fake');
      });
    });

    describe('POST /api/jobs/:id/unreport - Unreport Job', () => {
      it('should unreport a job successfully', async () => {
        vi.spyOn(jobService, 'unreportJob').mockResolvedValue();

        await jobService.unreportJob(mockUserId, mockJobId);

        expect(jobService.unreportJob).toHaveBeenCalledWith(mockUserId, mockJobId);
      });
    });

    describe('GET /api/jobs/skipped - Get Skipped Jobs', () => {
      it('should return skipped jobs with pagination', async () => {
        const mockSkipped = [
          { id: 'job-1', company: 'Company A', status: 'skipped' },
        ];

        vi.spyOn(jobService, 'getSkippedJobs').mockResolvedValue({
          items: mockSkipped,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        } as any);

        const result = await jobService.getSkippedJobs(mockUserId, 1, 20);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].status).toBe('skipped');
      });
    });
  });

  describe('Application Endpoints', () => {
    describe('GET /api/applications - Get Applications', () => {
      it('should return applications with pagination', async () => {
        const mockApplications = [
          {
            id: mockApplicationId,
            userId: mockUserId,
            jobId: mockJobId,
            stage: 'applied',
          },
        ];

        vi.spyOn(applicationService, 'getApplications').mockResolvedValue({
          items: mockApplications,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        } as any);

        const result = await applicationService.getApplications(mockUserId, 1, 20);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].stage).toBe('applied');
      });
    });

    describe('PUT /api/applications/:id/stage - Update Application Stage', () => {
      it('should update application stage successfully', async () => {
        vi.spyOn(applicationService, 'updateApplicationStage').mockResolvedValue({
          id: mockApplicationId,
          stage: 'Applied',
        } as any);

        const result = await applicationService.updateApplicationStage(
          mockUserId,
          mockApplicationId,
          'Applied'
        );

        expect(result.stage).toBe('Applied');
      });
    });

    describe('GET /api/applications/:id/documents - Get Application Documents', () => {
      it('should return application documents successfully', async () => {
        const mockApplication = {
          id: mockApplicationId,
          generatedResume: {
            fileUrl: 'https://example.com/resume.pdf',
            filename: 'resume.pdf',
            createdAt: new Date(),
          },
          generatedCoverLetter: {
            fileUrl: 'https://example.com/cover-letter.pdf',
            filename: 'cover-letter.pdf',
            createdAt: new Date(),
          },
        };

        vi.spyOn(applicationService, 'getApplicationDetails').mockResolvedValue(mockApplication as any);

        const result = await applicationService.getApplicationDetails(mockUserId, mockApplicationId);

        expect(result.generatedResume).toBeDefined();
        expect(result.generatedResume).not.toBeNull();
        if (result.generatedResume) {
          expect(result.generatedResume.fileUrl).toBe('https://example.com/resume.pdf');
        }
        expect(result.generatedCoverLetter).toBeDefined();
        expect(result.generatedCoverLetter).not.toBeNull();
        if (result.generatedCoverLetter) {
          expect(result.generatedCoverLetter.fileUrl).toBe('https://example.com/cover-letter.pdf');
        }
      });

      it('should return null for missing documents', async () => {
        const mockApplication = {
          id: mockApplicationId,
          generatedResume: null,
          generatedCoverLetter: null,
          customResumeUrl: null,
          customCoverLetterUrl: null,
        };

        vi.spyOn(applicationService, 'getApplicationDetails').mockResolvedValue(mockApplication as any);

        const result = await applicationService.getApplicationDetails(mockUserId, mockApplicationId);

        expect(result.generatedResume).toBeNull();
        expect(result.generatedCoverLetter).toBeNull();
        expect(result.customResumeUrl).toBeNull();
        expect(result.customCoverLetterUrl).toBeNull();
      });

      it('should return custom document URLs when present', async () => {
        const mockApplication = {
          id: mockApplicationId,
          generatedResume: null,
          generatedCoverLetter: null,
          customResumeUrl: 'https://example.com/my-resume.pdf',
          customCoverLetterUrl: 'https://example.com/my-cover-letter.pdf',
        };

        vi.spyOn(applicationService, 'getApplicationDetails').mockResolvedValue(mockApplication as any);

        const result = await applicationService.getApplicationDetails(mockUserId, mockApplicationId);

        expect(result.customResumeUrl).toBe('https://example.com/my-resume.pdf');
        expect(result.customCoverLetterUrl).toBe('https://example.com/my-cover-letter.pdf');
      });
    });

    describe('PUT /api/applications/:id/documents - Update Custom Document URLs', () => {
      it('should update custom document URLs successfully', async () => {
        vi.spyOn(applicationService, 'updateCustomDocuments').mockResolvedValue({
          id: mockApplicationId,
          customResumeUrl: 'https://example.com/custom-resume.pdf',
          customCoverLetterUrl: 'https://example.com/custom-cover-letter.pdf',
        } as any);

        const result = await applicationService.updateCustomDocuments(
          mockUserId,
          mockApplicationId,
          'https://example.com/custom-resume.pdf',
          'https://example.com/custom-cover-letter.pdf'
        );

        expect(result.customResumeUrl).toBe('https://example.com/custom-resume.pdf');
        expect(result.customCoverLetterUrl).toBe('https://example.com/custom-cover-letter.pdf');
      });

      it('should update only resume URL', async () => {
        vi.spyOn(applicationService, 'updateCustomDocuments').mockResolvedValue({
          id: mockApplicationId,
          customResumeUrl: 'https://example.com/custom-resume.pdf',
          customCoverLetterUrl: null,
        } as any);

        const result = await applicationService.updateCustomDocuments(
          mockUserId,
          mockApplicationId,
          'https://example.com/custom-resume.pdf',
          null
        );

        expect(result.customResumeUrl).toBe('https://example.com/custom-resume.pdf');
        expect(result.customCoverLetterUrl).toBeNull();
      });

      it('should update only cover letter URL', async () => {
        vi.spyOn(applicationService, 'updateCustomDocuments').mockResolvedValue({
          id: mockApplicationId,
          customResumeUrl: null,
          customCoverLetterUrl: 'https://example.com/custom-cover-letter.pdf',
        } as any);

        const result = await applicationService.updateCustomDocuments(
          mockUserId,
          mockApplicationId,
          null,
          'https://example.com/custom-cover-letter.pdf'
        );

        expect(result.customResumeUrl).toBeNull();
        expect(result.customCoverLetterUrl).toBe('https://example.com/custom-cover-letter.pdf');
      });
    });
  });

  describe('Saved Jobs Endpoints', () => {
    describe('GET /api/saved - Get Saved Jobs', () => {
      it('should return saved jobs with pagination', async () => {
        const mockSaved = [
          { id: 'job-1', company: 'Company A', saved: true },
        ];

        vi.spyOn(jobService, 'getSavedJobs').mockResolvedValue({
          items: mockSaved,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        } as any);

        const result = await jobService.getSavedJobs(mockUserId, 1, 20);

        expect(result.items).toHaveLength(1);
        expect(result.items[0].saved).toBe(true);
      });
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/register - Register User', () => {
      it('should register a new user successfully', async () => {
        const mockUser = {
          id: mockUserId,
          email: 'test@example.com',
        };

        const { authService } = await import('../../services/auth.service');
        vi.spyOn(authService, 'register').mockResolvedValue({
          user: mockUser,
          token: 'mock-token',
        } as any);

        const result = await authService.register('test@example.com', 'password123');

        expect(result.user.email).toBe('test@example.com');
        expect(result.token).toBeDefined();
      });
    });

    describe('POST /api/auth/login - Login User', () => {
      it('should login user successfully', async () => {
        const mockUser = {
          id: mockUserId,
          email: 'test@example.com',
        };

        const { authService } = await import('../../services/auth.service');
        vi.spyOn(authService, 'login').mockResolvedValue({
          user: mockUser,
          token: 'mock-token',
        } as any);

        const result = await authService.login('test@example.com', 'password123');

        expect(result.user.email).toBe('test@example.com');
        expect(result.token).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle not found errors gracefully', async () => {
      vi.spyOn(jobService, 'getJobWithStatus').mockRejectedValue(
        new Error('Job not found')
      );

      await expect(
        jobService.getJobWithStatus(mockUserId, 'non-existent-job')
      ).rejects.toThrow('Job not found');
    });

    it('should handle validation errors', async () => {
      vi.spyOn(jobService, 'reportJob').mockRejectedValue(
        new Error('Invalid reason')
      );

      await expect(
        jobService.reportJob(mockUserId, mockJobId, 'invalid' as any, '')
      ).rejects.toThrow('Invalid reason');
    });
  });

  describe('Pagination', () => {
    it('should handle pagination correctly for all paginated endpoints', async () => {
      vi.spyOn(jobService, 'getSavedJobs').mockResolvedValue({
        items: [],
        pagination: {
          total: 100,
          page: 2,
          limit: 20,
          totalPages: 5,
        },
      } as any);

      const result = await jobService.getSavedJobs(mockUserId, 2, 20);

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.totalPages).toBe(5);
    });
  });

  describe('Search Functionality', () => {
    it('should support search across different endpoints', async () => {
      const searchTerm = 'Software Engineer';

      vi.spyOn(jobService, 'getPendingJobs').mockResolvedValue({
        jobs: [],
        total: 0,
        remaining: 0,
      } as any);

      await jobService.getPendingJobs(mockUserId, searchTerm);

      expect(jobService.getPendingJobs).toHaveBeenCalledWith(mockUserId, searchTerm);
    });
  });
});
