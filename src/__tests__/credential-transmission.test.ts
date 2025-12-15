import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { credentialTransmissionService } from '../services/credential-transmission.service';

// Mock the microservice client
vi.mock('../lib/microservice-client', () => ({
  stageUpdaterClient: {
    request: vi.fn(),
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

import { stageUpdaterClient } from '../lib/microservice-client';

describe('Credential Transmission Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendCredentials', () => {
    it('should successfully send Gmail credentials', async () => {
      const mockResponse = {
        success: true,
        message: 'Credentials received',
      };

      vi.mocked(stageUpdaterClient.request).mockResolvedValue(mockResponse);

      const result = await credentialTransmissionService.sendCredentials(
        'user-123',
        'gmail',
        {
          email: 'user@gmail.com',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }
      );

      expect(result.success).toBe(true);
      expect(stageUpdaterClient.request).toHaveBeenCalledWith(
        '/email-credentials',
        expect.objectContaining({
          method: 'POST',
          body: {
            userId: 'user-123',
            provider: 'gmail',
            credentials: {
              email: 'user@gmail.com',
              accessToken: 'access-token',
              refreshToken: 'refresh-token',
            },
          },
        })
      );
    });

    it('should successfully send IMAP credentials', async () => {
      const mockResponse = {
        success: true,
        message: 'Credentials received',
      };

      vi.mocked(stageUpdaterClient.request).mockResolvedValue(mockResponse);

      const result = await credentialTransmissionService.sendCredentials(
        'user-456',
        'imap',
        {
          email: 'user@example.com',
          imapServer: 'imap.example.com',
          imapPort: 993,
          imapUsername: 'user',
          imapPassword: 'password',
        }
      );

      expect(result.success).toBe(true);
      expect(stageUpdaterClient.request).toHaveBeenCalledWith(
        '/email-credentials',
        expect.objectContaining({
          method: 'POST',
          body: {
            userId: 'user-456',
            provider: 'imap',
            credentials: {
              email: 'user@example.com',
              imapServer: 'imap.example.com',
              imapPort: 993,
              imapUsername: 'user',
              imapPassword: 'password',
            },
          },
        })
      );
    });

    it('should retry on transient failures', async () => {
      // First two calls fail, third succeeds
      vi.mocked(stageUpdaterClient.request)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          success: true,
          message: 'Credentials received',
        });

      const result = await credentialTransmissionService.sendCredentials(
        'user-123',
        'gmail',
        {
          email: 'user@gmail.com',
          accessToken: 'access-token',
        },
        {
          maxRetries: 3,
          retryDelay: 10, // Short delay for tests
        }
      );

      expect(result.success).toBe(true);
      expect(stageUpdaterClient.request).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries exhausted', async () => {
      vi.mocked(stageUpdaterClient.request).mockRejectedValue(
        new Error('Service unavailable')
      );

      await expect(
        credentialTransmissionService.sendCredentials(
          'user-123',
          'gmail',
          {
            email: 'user@gmail.com',
            accessToken: 'access-token',
          },
          {
            maxRetries: 2,
            retryDelay: 10,
          }
        )
      ).rejects.toThrow('Failed to send credentials after 3 attempts');

      expect(stageUpdaterClient.request).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should throw error when service returns success: false', async () => {
      vi.mocked(stageUpdaterClient.request).mockResolvedValue({
        success: false,
        error: 'Invalid credentials',
      });

      await expect(
        credentialTransmissionService.sendCredentials(
          'user-123',
          'gmail',
          {
            email: 'user@gmail.com',
            accessToken: 'invalid-token',
          },
          {
            maxRetries: 0, // No retries for this test
          }
        )
      ).rejects.toThrow('Invalid credentials');
    });

    it('should include requestId in the request', async () => {
      vi.mocked(stageUpdaterClient.request).mockResolvedValue({
        success: true,
      });

      await credentialTransmissionService.sendCredentials(
        'user-123',
        'outlook',
        {
          email: 'user@outlook.com',
          accessToken: 'token',
        },
        {
          requestId: 'req-123',
        }
      );

      expect(stageUpdaterClient.request).toHaveBeenCalledWith(
        '/email-credentials',
        expect.objectContaining({
          requestId: 'req-123',
        })
      );
    });

    it('should use exponential backoff for retries', async () => {
      const sleepSpy = vi.spyOn(credentialTransmissionService, 'sleep');
      
      vi.mocked(stageUpdaterClient.request)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockResolvedValueOnce({ success: true });

      await credentialTransmissionService.sendCredentials(
        'user-123',
        'gmail',
        { email: 'test@gmail.com', accessToken: 'token' },
        { retryDelay: 100, maxRetries: 3 }
      );

      // Check exponential backoff: 100ms, 200ms
      expect(sleepSpy).toHaveBeenCalledWith(100); // 100 * 2^0
      expect(sleepSpy).toHaveBeenCalledWith(200); // 100 * 2^1
    });
  });

  describe('testConnection', () => {
    it('should return true when service URL is configured', async () => {
      process.env.STAGE_UPDATER_SERVICE_URL = 'https://stage-updater.example.com';
      
      const result = await credentialTransmissionService.testConnection();
      
      expect(result).toBe(true);
    });

    it('should return false when service URL is not configured', async () => {
      delete process.env.STAGE_UPDATER_SERVICE_URL;
      
      const result = await credentialTransmissionService.testConnection();
      
      expect(result).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should wait for the specified duration', async () => {
      const start = Date.now();
      await credentialTransmissionService.sleep(50);
      const elapsed = Date.now() - start;
      
      // Allow some margin for test execution time
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });
});
