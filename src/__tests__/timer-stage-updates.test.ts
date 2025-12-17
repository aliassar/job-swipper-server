import { describe, it, expect, beforeEach, vi } from 'vitest';
import { timerHandlers } from '../services/timer-handlers.service';
import { db } from '../lib/db';
import { workflowService } from '../services/workflow.service';

// Mock the database module
vi.mock('../lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock workflow service
vi.mock('../services/workflow.service', () => ({
  workflowService: {
    getWorkflowByApplication: vi.fn(),
    processWorkflow: vi.fn(),
  },
}));

// Mock logger
vi.mock('../middleware/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Timer Handlers - Stage Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCvVerificationTimeout', () => {
    it('should update application stage to Message Check before processing workflow', async () => {
      const mockTimer = {
        id: 'timer-1',
        userId: 'user-1',
        type: 'cv_verification',
        targetId: 'app-1',
        executeAt: new Date(),
        metadata: { applicationId: 'app-1' },
      };

      const mockApplication = {
        id: 'app-1',
        userId: 'user-1',
        jobId: 'job-1',
        stage: 'CV Check',
        createdAt: new Date(),
        lastUpdated: new Date(),
      };

      const mockWorkflowRun = {
        id: 'workflow-1',
        applicationId: 'app-1',
        status: 'in_progress',
      };

      // Mock application query
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockApplication]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      // Mock application update
      let updateCalled = false;
      let updateData: any;
      const mockUpdateChain = {
        set: vi.fn().mockImplementation((data) => {
          updateData = data;
          updateCalled = true;
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      // Mock workflow service
      (workflowService.getWorkflowByApplication as any).mockResolvedValue(mockWorkflowRun);
      (workflowService.processWorkflow as any).mockResolvedValue(undefined);

      await timerHandlers.handleCvVerificationTimeout(mockTimer);

      // Verify stage was updated to Message Check
      expect(updateCalled).toBe(true);
      expect(updateData.stage).toBe('Message Check');
      expect(updateData.lastUpdated).toBeInstanceOf(Date);
      expect(updateData.updatedAt).toBeInstanceOf(Date);

      // Verify update was called before workflow processing
      expect(db.update).toHaveBeenCalled();
      expect(workflowService.processWorkflow).toHaveBeenCalledWith('workflow-1');
    });

    it('should not update stage if application not in CV Check stage', async () => {
      const mockTimer = {
        id: 'timer-1',
        userId: 'user-1',
        type: 'cv_verification',
        targetId: 'app-1',
        executeAt: new Date(),
        metadata: { applicationId: 'app-1' },
      };

      const mockApplication = {
        id: 'app-1',
        userId: 'user-1',
        jobId: 'job-1',
        stage: 'Applied', // Different stage
        createdAt: new Date(),
        lastUpdated: new Date(),
      };

      // Mock application query
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockApplication]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      await timerHandlers.handleCvVerificationTimeout(mockTimer);

      // Verify update was NOT called
      expect(db.update).not.toHaveBeenCalled();
      expect(workflowService.processWorkflow).not.toHaveBeenCalled();
    });

    it('should handle missing application gracefully', async () => {
      const mockTimer = {
        id: 'timer-1',
        userId: 'user-1',
        type: 'cv_verification',
        targetId: 'app-1',
        executeAt: new Date(),
        metadata: { applicationId: 'app-1' },
      };

      // Mock application query to return empty array
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      await timerHandlers.handleCvVerificationTimeout(mockTimer);

      // Verify no update or workflow processing occurred
      expect(db.update).not.toHaveBeenCalled();
      expect(workflowService.processWorkflow).not.toHaveBeenCalled();
    });

    it('should handle missing workflow run gracefully', async () => {
      const mockTimer = {
        id: 'timer-1',
        userId: 'user-1',
        type: 'cv_verification',
        targetId: 'app-1',
        executeAt: new Date(),
        metadata: { applicationId: 'app-1' },
      };

      const mockApplication = {
        id: 'app-1',
        userId: 'user-1',
        jobId: 'job-1',
        stage: 'CV Check',
        createdAt: new Date(),
        lastUpdated: new Date(),
      };

      // Mock application query
      const mockSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([mockApplication]),
      };
      (db.select as any).mockReturnValue(mockSelectChain);

      // Mock application update
      const mockUpdateChain = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      (db.update as any).mockReturnValue(mockUpdateChain);

      // Mock workflow service to return null
      (workflowService.getWorkflowByApplication as any).mockResolvedValue(null);

      await timerHandlers.handleCvVerificationTimeout(mockTimer);

      // Verify stage was still updated
      expect(db.update).toHaveBeenCalled();
      // Verify processWorkflow was not called
      expect(workflowService.processWorkflow).not.toHaveBeenCalled();
    });
  });
});
