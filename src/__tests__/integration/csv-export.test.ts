import { describe, it, expect, vi } from 'vitest';

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
import { applicationService } from '../../services/application.service';

/**
 * Tests for CSV export handling of special characters
 * Ensures newlines, carriage returns, and other special characters are properly escaped
 */
describe('CSV Export Special Characters Tests', () => {
  describe('Job Service CSV Export', () => {
    it('should handle newlines in job descriptions', async () => {
      const jobsWithNewlines = [
        {
          company: 'Test Company',
          position: 'Software Engineer',
          location: 'New York, NY',
          salary: '$120,000',
          skills: 'JavaScript\nReact\nNode.js',
          jobType: 'Full-time',
          status: 'pending',
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithNewlines);

      // Newlines should be replaced with spaces
      expect(csv).toContain('JavaScript React Node.js');
      expect(csv).not.toMatch(/JavaScript\nReact/);
    });

    it('should handle Windows-style newlines (CRLF)', async () => {
      const jobsWithCRLF = [
        {
          company: 'Test Company',
          position: 'Software Engineer',
          location: 'New York, NY',
          salary: '$120,000',
          skills: 'Line 1\r\nLine 2\r\nLine 3',
          jobType: 'Full-time',
          status: 'pending',
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithCRLF);

      // Windows newlines should be replaced with spaces
      expect(csv).toContain('Line 1 Line 2 Line 3');
      expect(csv).not.toMatch(/Line 1\r\nLine 2/);
    });

    it('should handle old Mac-style newlines (CR)', async () => {
      const jobsWithCR = [
        {
          company: 'Test Company',
          position: 'Software Engineer',
          location: 'New York, NY',
          salary: '$120,000',
          skills: 'Skill 1\rSkill 2\rSkill 3',
          jobType: 'Full-time',
          status: 'pending',
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithCR);

      // Mac newlines should be replaced with spaces
      expect(csv).toContain('Skill 1 Skill 2 Skill 3');
      expect(csv).not.toMatch(/Skill 1\rSkill 2/);
    });

    it('should still escape double quotes correctly', async () => {
      const jobsWithQuotes = [
        {
          company: 'Company "Best" Inc.',
          position: 'Software Engineer',
          location: 'New York, NY',
          salary: '$120,000',
          skills: 'JavaScript',
          jobType: 'Full-time',
          status: 'pending',
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithQuotes);

      // Double quotes should be escaped with double double quotes
      expect(csv).toContain('""Best""');
    });

    it('should handle combination of newlines and quotes', async () => {
      const jobsWithMixed = [
        {
          company: 'Test Company',
          position: 'Software "Senior" Engineer',
          location: 'New York, NY',
          salary: '$120,000',
          skills: 'JavaScript\n"React"\nNode.js',
          jobType: 'Full-time',
          status: 'pending',
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithMixed);

      // Both quotes and newlines should be properly handled
      expect(csv).toContain('""Senior""');
      expect(csv).toContain('JavaScript ""React"" Node.js');
    });
  });

  describe('Application Service CSV Export', () => {
    it('should handle newlines in application notes', async () => {
      const applicationsWithNewlines = [
        {
          id: 'app-1',
          userId: 'user-123',
          jobId: 'job-123',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'First line\nSecond line\nThird line',
          job: {
            company: 'Tech Corp',
            position: 'Software Engineer',
            location: 'San Francisco, CA',
            salary: '$120,000',
          },
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(applicationsWithNewlines);

      // Newlines should be replaced with spaces
      expect(csv).toContain('First line Second line Third line');
      expect(csv).not.toMatch(/First line\nSecond line/);
    });

    it('should handle Windows-style newlines in application notes', async () => {
      const applicationsWithCRLF = [
        {
          id: 'app-1',
          userId: 'user-123',
          jobId: 'job-123',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'Note line 1\r\nNote line 2',
          job: {
            company: 'Tech Corp',
            position: 'Software Engineer',
            location: 'San Francisco, CA',
            salary: '$120,000',
          },
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(applicationsWithCRLF);

      // Windows newlines should be replaced with spaces
      expect(csv).toContain('Note line 1 Note line 2');
      expect(csv).not.toMatch(/Note line 1\r\nNote line 2/);
    });

    it('should handle combination of special characters in applications', async () => {
      const applicationsWithMixed = [
        {
          id: 'app-1',
          userId: 'user-123',
          jobId: 'job-123',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'Applied with "custom" resume\nGot response\r\nScheduled interview',
          job: {
            company: 'Tech Corp',
            position: 'Software Engineer',
            location: 'San Francisco, CA',
            salary: '$120,000',
          },
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(applicationsWithMixed);

      // Both quotes and newlines should be properly handled
      expect(csv).toContain('""custom""');
      expect(csv).toContain('Applied with ""custom"" resume Got response Scheduled interview');
    });
  });

  describe('CSV Structure Validation', () => {
    it('should produce valid CSV with proper line breaks only between rows', async () => {
      const jobs = [
        {
          company: 'Company 1',
          position: 'Position with\nnewline',
          location: 'Location',
          salary: 'Salary',
          skills: 'Skills',
          jobType: 'Full-time',
          status: 'pending',
        },
        {
          company: 'Company 2',
          position: 'Position 2',
          location: 'Location',
          salary: 'Salary',
          skills: 'Skills',
          jobType: 'Full-time',
          status: 'pending',
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobs);
      const lines = csv.split('\n');

      // Should have header + 2 data rows = 3 lines
      expect(lines.length).toBe(3);
      
      // Each line should be a complete row
      expect(lines[0]).toContain('Company,Position,Location');
      expect(lines[1]).toContain('Company 1');
      expect(lines[2]).toContain('Company 2');
    });
  });
});
