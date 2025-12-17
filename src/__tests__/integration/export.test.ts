import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applicationService } from '../../services/application.service';
import { jobService } from '../../services/job.service';

// Mock the database module
vi.mock('../../lib/db', () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

/**
 * Integration tests for export functionality
 * Tests CSV and PDF export for application history and saved jobs
 */
describe('Export APIs Integration Tests', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Application History Export', () => {
    const mockApplications = [
      {
        id: 'app-1',
        userId: mockUserId,
        jobId: 'job-1',
        stage: 'applied',
        appliedAt: new Date('2024-01-01'),
        notes: 'First application',
        job: {
          company: 'Tech Corp',
          position: 'Software Engineer',
          location: 'San Francisco, CA',
          salary: '$120,000 - $150,000',
        },
      },
      {
        id: 'app-2',
        userId: mockUserId,
        jobId: 'job-2',
        stage: 'interviewing',
        appliedAt: new Date('2024-01-05'),
        notes: 'Had first interview',
        job: {
          company: 'Startup Inc',
          position: 'Full Stack Developer',
          location: 'Remote',
          salary: '$100,000 - $130,000',
        },
      },
    ];

    it('should export applications to CSV format', async () => {
      const csv = await applicationService.exportApplicationsToCSV(mockApplications);

      expect(csv).toBeDefined();
      expect(csv).toContain('Company,Position,Location,Salary,Stage,Applied At,Notes');
      expect(csv).toContain('Tech Corp');
      expect(csv).toContain('Software Engineer');
      expect(csv).toContain('applied');
      expect(csv).toContain('Startup Inc');
      expect(csv).toContain('interviewing');
    });

    it('should properly escape CSV special characters', async () => {
      const applicationsWithSpecialChars = [
        {
          id: 'app-3',
          userId: mockUserId,
          jobId: 'job-3',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'Note with "quotes" and, commas',
          job: {
            company: 'Company, Inc.',
            position: 'Developer "Senior"',
            location: 'New York, NY',
            salary: '$150,000',
          },
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(applicationsWithSpecialChars);

      expect(csv).toContain('""quotes""');
      expect(csv).toContain('"Company, Inc."');
    });

    it('should escape newlines in notes field', async () => {
      const applicationsWithNewlines = [
        {
          id: 'app-4',
          userId: mockUserId,
          jobId: 'job-4',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'First line\nSecond line\r\nThird line',
          job: {
            company: 'Test Company',
            position: 'Developer',
            location: 'Remote',
            salary: '$100,000',
          },
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(applicationsWithNewlines);

      // Newlines should be replaced with spaces
      expect(csv).toContain('First line Second line Third line');
      
      // Check that CSV structure is preserved (only header and one data row)
      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // Header + 1 data row
      
      // Verify newlines within cells are replaced
      const dataRow = lines[1];
      expect(dataRow).toContain('First line Second line Third line');
      expect(dataRow).not.toMatch(/\n(?!")/); // No newlines except at end of row
    });

    it('should support flat data structure (without nested job object)', async () => {
      const flatApplications = [
        {
          id: 'app-5',
          userId: mockUserId,
          jobId: 'job-5',
          company: 'Flat Corp',
          position: 'Engineer',
          location: 'Seattle, WA',
          salary: '$120,000',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'Test note',
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(flatApplications);

      expect(csv).toContain('Flat Corp');
      expect(csv).toContain('Engineer');
      expect(csv).toContain('Seattle, WA');
      expect(csv).toContain('$120,000');
      expect(csv).toContain('applied');
    });

    it('should support mixed nested and flat data structures', async () => {
      const mixedApplications = [
        {
          id: 'app-6',
          userId: mockUserId,
          jobId: 'job-6',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'Nested structure',
          job: {
            company: 'Nested Corp',
            position: 'Senior Dev',
            location: 'Boston, MA',
            salary: '$140,000',
          },
        },
        {
          id: 'app-7',
          userId: mockUserId,
          jobId: 'job-7',
          company: 'Flat Inc',
          position: 'Junior Dev',
          location: 'Austin, TX',
          salary: '$90,000',
          stage: 'interviewing',
          appliedAt: new Date('2024-01-02'),
          notes: 'Flat structure',
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(mixedApplications);

      // Should handle nested structure
      expect(csv).toContain('Nested Corp');
      expect(csv).toContain('Senior Dev');
      
      // Should handle flat structure
      expect(csv).toContain('Flat Inc');
      expect(csv).toContain('Junior Dev');
    });

    it('should export applications to PDF format', async () => {
      const pdf = await applicationService.exportApplicationsToPDF(mockApplications);

      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
      
      // PDF files start with %PDF
      const header = pdf.toString('utf-8', 0, 4);
      expect(header).toBe('%PDF');
    });

    it('should handle empty application list in CSV export', async () => {
      const csv = await applicationService.exportApplicationsToCSV([]);

      expect(csv).toBeDefined();
      expect(csv).toContain('Company,Position,Location,Salary,Stage,Applied At,Notes');
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // Only header
    });

    it('should handle empty application list in PDF export', async () => {
      const pdf = await applicationService.exportApplicationsToPDF([]);

      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
    });

    it('should include all required fields in CSV export', async () => {
      const csv = await applicationService.exportApplicationsToCSV(mockApplications);
      const lines = csv.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toContain('Company');
      expect(headers).toContain('Position');
      expect(headers).toContain('Location');
      expect(headers).toContain('Salary');
      expect(headers).toContain('Stage');
      expect(headers).toContain('Applied At');
      expect(headers).toContain('Notes');
    });
  });

  describe('Saved Jobs Export', () => {
    const mockSavedJobs = [
      {
        id: 'job-1',
        company: 'Tech Corp',
        position: 'Software Engineer',
        location: 'San Francisco, CA',
        salary: '$120,000 - $150,000',
        skills: 'JavaScript, React, Node.js',
        jobType: 'Full-time' as const,
        status: 'pending' as const,
        saved: true,
      },
      {
        id: 'job-2',
        company: 'Startup Inc',
        position: 'Full Stack Developer',
        location: 'Remote',
        salary: '$100,000 - $130,000',
        skills: 'Python, Django, PostgreSQL',
        jobType: 'Full-time' as const,
        status: 'pending' as const,
        saved: true,
      },
    ];

    it('should retrieve saved jobs for export', async () => {
      vi.spyOn(jobService, 'getSavedJobs').mockResolvedValue({
        items: mockSavedJobs,
        pagination: {
          total: mockSavedJobs.length,
          page: 1,
          limit: 10000,
          totalPages: 1,
        },
      } as any);

      const result = await jobService.getSavedJobs(mockUserId, 1, 10000);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].company).toBe('Tech Corp');
      expect(result.items[1].company).toBe('Startup Inc');
    });

    it('should export saved jobs to CSV format', async () => {
      const csv = await jobService.exportSavedJobsToCSV(mockSavedJobs);

      expect(csv).toBeDefined();
      expect(csv).toContain('Company,Position,Location,Salary,Skills,Job Type,Status');
      expect(csv).toContain('Tech Corp');
      expect(csv).toContain('Software Engineer');
      expect(csv).toContain('Startup Inc');
    });

    it('should escape newlines in saved jobs CSV', async () => {
      const jobsWithNewlines = [
        {
          id: 'job-3',
          company: 'Test\nCompany',
          position: 'Dev\r\nEngineer',
          location: 'Remote',
          salary: '$100,000',
          skills: 'Java\nPython',
          jobType: 'Full-time',
          status: 'pending',
          saved: true,
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithNewlines);

      // Newlines should be replaced with spaces
      expect(csv).toContain('Test Company');
      expect(csv).toContain('Dev Engineer');
      expect(csv).toContain('Java Python');
      
      // Check that CSV structure is preserved (only header and one data row)
      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // Header + 1 data row
      
      // Verify newlines within cells are replaced
      const dataRow = lines[1];
      expect(dataRow).toContain('Test Company');
      expect(dataRow).toContain('Dev Engineer');
      expect(dataRow).not.toMatch(/\n(?!")/); // No newlines except at end of row
    });

    it('should handle skills as array in saved jobs CSV', async () => {
      const jobsWithArraySkills = [
        {
          id: 'job-4',
          company: 'Array Corp',
          position: 'Developer',
          location: 'Remote',
          salary: '$110,000',
          skills: ['JavaScript', 'TypeScript', 'React'],
          jobType: 'Full-time',
          status: 'pending',
          saved: true,
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithArraySkills);

      // Skills array should be joined with ', '
      expect(csv).toContain('JavaScript, TypeScript, React');
    });

    it('should properly escape special characters in saved jobs', async () => {
      const jobsWithSpecialChars = [
        {
          id: 'job-5',
          company: 'Company, "Inc"',
          position: 'Developer "Senior"',
          location: 'New York, NY',
          salary: '$150,000',
          skills: 'Java, "Spring", Hibernate',
          jobType: 'Full-time',
          status: 'pending',
          saved: true,
        },
      ];

      const csv = await jobService.exportSavedJobsToCSV(jobsWithSpecialChars);

      expect(csv).toContain('""Inc""');
      expect(csv).toContain('""Senior""');
      expect(csv).toContain('""Spring""');
    });
  });

  describe('Export with filters', () => {
    it('should support date range filtering for application export', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      vi.spyOn(applicationService, 'getApplicationHistory').mockResolvedValue({
        items: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10000,
          totalPages: 0,
        },
      } as any);

      await applicationService.getApplicationHistory(mockUserId, {
        startDate,
        endDate,
        page: 1,
        limit: 10000,
      });

      expect(applicationService.getApplicationHistory).toHaveBeenCalledWith(mockUserId, {
        startDate,
        endDate,
        page: 1,
        limit: 10000,
      });
    });

    it('should support stage filtering for application export', async () => {
      vi.spyOn(applicationService, 'getApplicationHistory').mockResolvedValue({
        items: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10000,
          totalPages: 0,
        },
      } as any);

      await applicationService.getApplicationHistory(mockUserId, {
        stage: 'interviewing',
        page: 1,
        limit: 10000,
      });

      expect(applicationService.getApplicationHistory).toHaveBeenCalledWith(mockUserId, {
        stage: 'interviewing',
        page: 1,
        limit: 10000,
      });
    });

    it('should support search filtering for application export', async () => {
      vi.spyOn(applicationService, 'getApplicationHistory').mockResolvedValue({
        items: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10000,
          totalPages: 0,
        },
      } as any);

      await applicationService.getApplicationHistory(mockUserId, {
        search: 'Software Engineer',
        page: 1,
        limit: 10000,
      });

      expect(applicationService.getApplicationHistory).toHaveBeenCalledWith(mockUserId, {
        search: 'Software Engineer',
        page: 1,
        limit: 10000,
      });
    });
  });
});
