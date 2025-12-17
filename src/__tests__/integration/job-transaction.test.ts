import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module before importing services
vi.mock('../../lib/db', () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../middleware/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock the microservice client
vi.mock('../../lib/microservice-client', () => ({
  jobFilterClient: {
    request: vi.fn(),
  },
}));

// Mock the timer service
vi.mock('../../services/timer.service', () => ({
  timerService: {
    scheduleAutoApplyDelay: vi.fn(),
    cancelTimersByTarget: vi.fn(),
    scheduleDocDeletionTimer: vi.fn(),
  },
}));

import { jobService } from '../../services/job.service';
import { db } from '../../lib/db';

/**
 * Integration tests for job service transaction handling
 * Tests that blockCompany properly uses transaction context
 */
describe('Job Service Transaction Tests', () => {
  const mockUserId = 'test-user-123';
  const mockJobId = 'test-job-123';
  const mockCompanyName = 'Test Company';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('blockCompany transaction context', () => {
    it('should use transaction context when provided', async () => {
      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'blocked-1',
              userId: mockUserId,
              companyName: mockCompanyName,
              reason: 'Test reason',
              createdAt: new Date(),
            }]),
          }),
        }),
      };

      await jobService.blockCompany(mockUserId, mockCompanyName, 'Test reason', mockTx);

      // Verify that tx.insert was called instead of db.insert
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('should use db context when transaction not provided', async () => {
      const dbInsertSpy = vi.spyOn(db, 'insert').mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'blocked-1',
            userId: mockUserId,
            companyName: mockCompanyName,
            reason: 'Test reason',
            createdAt: new Date(),
          }]),
        }),
      } as any);

      await jobService.blockCompany(mockUserId, mockCompanyName, 'Test reason');

      // Verify that db.insert was called when no transaction context
      expect(dbInsertSpy).toHaveBeenCalled();
    });
  });

  describe('reportJob transaction atomicity', () => {
    it('should pass transaction context to blockCompany when reporting with dont_recommend_company', async () => {
      // Mock the necessary database operations
      const mockJob = {
        id: mockJobId,
        company: mockCompanyName,
        position: 'Software Engineer',
        status: null,
        saved: false,
      };

      vi.spyOn(jobService, 'getJobWithStatus').mockResolvedValue(mockJob as any);
      
      const blockCompanySpy = vi.spyOn(jobService, 'blockCompany').mockResolvedValue({
        id: 'blocked-1',
        userId: mockUserId,
        companyName: mockCompanyName,
        reason: 'Reported via dont_recommend_company',
        createdAt: new Date(),
      });

      const mockTx = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'report-1',
              userId: mockUserId,
              jobId: mockJobId,
              reason: 'dont_recommend_company',
              createdAt: new Date(),
            }]),
          }),
        }),
      };

      vi.spyOn(db, 'transaction').mockImplementation(async (callback) => {
        return await callback(mockTx as any);
      });

      await jobService.reportJob(mockUserId, mockJobId, 'dont_recommend_company', 'Test details');

      // Verify that blockCompany was called with transaction context
      expect(blockCompanySpy).toHaveBeenCalledWith(
        mockUserId,
        mockCompanyName,
        'Reported via dont_recommend_company',
        mockTx
      );
    });
  });
});
