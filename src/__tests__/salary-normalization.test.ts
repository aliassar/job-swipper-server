import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSalaryRange } from '../lib/utils';

// Mock the database module before imports
vi.mock('../lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../middleware/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks are set up
const { salaryNormalizationService } = await import(
  '../services/salary-normalization.service'
);
const { db } = await import('../lib/db');

describe('Salary Normalization Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeSalaryForJob', () => {
    it('should normalize salary range with dash', async () => {
      const mockJobId = 'test-job-id-1';
      const mockSalary = '$50,000 - $80,000';

      // Mock select to return job
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: mockJobId,
            salary: mockSalary,
          },
        ]),
      };
      (db.select as any).mockReturnValue(selectMock);

      // Mock update
      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(updateMock);

      // Call the service
      const result = await salaryNormalizationService.normalizeSalaryForJob(
        mockJobId
      );

      expect(result).toBe(true);
      expect(db.select).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      
      // Verify the correct salary values were set
      const setCall = updateMock.set.mock.calls[0][0];
      expect(setCall.salaryMin).toBe(50000);
      expect(setCall.salaryMax).toBe(80000);
    });

    it('should normalize salary with k notation', async () => {
      const mockJobId = 'test-job-id-2';
      const mockSalary = '$60k-$90k';

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: mockJobId,
            salary: mockSalary,
          },
        ]),
      };
      (db.select as any).mockReturnValue(selectMock);

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(updateMock);

      await salaryNormalizationService.normalizeSalaryForJob(mockJobId);

      const setCall = updateMock.set.mock.calls[0][0];
      expect(setCall.salaryMin).toBe(60000);
      expect(setCall.salaryMax).toBe(90000);
    });

    it('should handle non-existent job', async () => {
      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(selectMock);

      const result = await salaryNormalizationService.normalizeSalaryForJob(
        'non-existent-id'
      );

      expect(result).toBe(false);
      expect(db.update).not.toHaveBeenCalled();
    });

    it('should handle non-numeric salary', async () => {
      const mockJobId = 'test-job-id-3';

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: mockJobId,
            salary: 'Competitive',
          },
        ]),
      };
      (db.select as any).mockReturnValue(selectMock);

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(updateMock);

      await salaryNormalizationService.normalizeSalaryForJob(mockJobId);

      const setCall = updateMock.set.mock.calls[0][0];
      expect(setCall.salaryMin).toBeNull();
      expect(setCall.salaryMax).toBeNull();
    });
  });

  describe('normalizeAllSalaries', () => {
    it('should normalize multiple jobs', async () => {
      const mockJobs = [
        { id: '1', salary: '$50,000 - $80,000', salaryMin: null, salaryMax: null },
        { id: '2', salary: '$60k-$90k', salaryMin: null, salaryMax: null },
        { id: '3', salary: 'Competitive', salaryMin: null, salaryMax: null },
      ];

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockJobs),
      };
      (db.select as any).mockReturnValue(selectMock);

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      (db.update as any).mockReturnValue(updateMock);

      const result = await salaryNormalizationService.normalizeAllSalaries();

      expect(result.processed).toBe(3);
      expect(result.updated).toBe(2); // First two have parseable salaries
      expect(result.failed).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      const mockJobs = [
        { id: '1', salary: '$50,000 - $80,000', salaryMin: null, salaryMax: null },
      ];

      const selectMock = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(mockJobs),
      };
      (db.select as any).mockReturnValue(selectMock);

      const updateMock = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('Database error')),
      };
      (db.update as any).mockReturnValue(updateMock);

      const result = await salaryNormalizationService.normalizeAllSalaries();

      expect(result.processed).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('parseSalaryRange integration', () => {
    it('should correctly parse various salary formats', () => {
      expect(parseSalaryRange('$50,000 - $80,000')).toEqual({
        min: 50000,
        max: 80000,
      });
      expect(parseSalaryRange('$60k-$90k')).toEqual({ min: 60000, max: 90000 });
      expect(parseSalaryRange('$75,000')).toEqual({ min: 75000, max: 75000 });
      expect(parseSalaryRange('Competitive')).toEqual({ min: null, max: null });
    });
  });
});
