import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database before importing the service
vi.mock('../lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock fetch globally
global.fetch = vi.fn();

// Mock logger
vi.mock('../middleware/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock encryption
vi.mock('../lib/encryption', () => ({
  decryptCredentials: vi.fn((credentials) => {
    // Simple mock that returns decrypted versions
    const result: any = {};
    if (credentials.encryptedAccessToken) {
      result.accessToken = 'decrypted-access-token';
    }
    if (credentials.encryptedRefreshToken) {
      result.refreshToken = 'decrypted-refresh-token';
    }
    if (credentials.encryptedImapPassword) {
      result.imapPassword = 'decrypted-imap-password';
    }
    return result;
  }),
  encryptCredentials: vi.fn((credentials) => ({
    encryptedAccessToken: credentials.accessToken ? 'encrypted-access-token' : undefined,
    encryptedRefreshToken: credentials.refreshToken ? 'encrypted-refresh-token' : undefined,
    encryptedImapPassword: credentials.imapPassword ? 'encrypted-imap-password' : undefined,
    encryptionIv: 'test-iv',
  })),
}));

import { emailConnectionService } from '../services/email-connection.service';

describe('Email Connection Sync to Stage Updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up environment variable
    process.env.STAGE_UPDATER_SERVICE_URL = 'http://localhost:3002';
    process.env.STAGE_UPDATER_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STAGE_UPDATER_SERVICE_URL;
    delete process.env.STAGE_UPDATER_API_KEY;
  });

  describe('syncToStageUpdater', () => {
    it('should sync Gmail connection successfully', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        provider: 'gmail',
        email: 'user@gmail.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{}'),
        json: vi.fn().mockResolvedValue({}),
      } as any);

      const result = await emailConnectionService.syncToStageUpdater(mockConnection);

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3002/api/credentials/sync',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Service-Key': 'test-api-key',
          }),
        })
      );

      // Verify the body contains decrypted credentials
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.userId).toBe('user-123');
      expect(body.connectionId).toBe('conn-123');
      expect(body.provider).toBe('gmail');
      expect(body.email).toBe('user@gmail.com');
      expect(body.credentials.accessToken).toBe('decrypted-access-token');
      expect(body.credentials.refreshToken).toBe('decrypted-refresh-token');
    });

    it('should sync Outlook connection successfully', async () => {
      const mockConnection = {
        id: 'conn-456',
        userId: 'user-456',
        provider: 'outlook',
        email: 'user@outlook.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{}'),
        json: vi.fn().mockResolvedValue({}),
      } as any);

      const result = await emailConnectionService.syncToStageUpdater(mockConnection);

      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should sync Yahoo connection successfully', async () => {
      const mockConnection = {
        id: 'conn-789',
        userId: 'user-789',
        provider: 'yahoo',
        email: 'user@yahoo.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{}'),
        json: vi.fn().mockResolvedValue({}),
      } as any);

      const result = await emailConnectionService.syncToStageUpdater(mockConnection);

      expect(result.success).toBe(true);
    });

    it('should sync IMAP connection successfully', async () => {
      const mockConnection = {
        id: 'conn-imap',
        userId: 'user-imap',
        provider: 'imap',
        email: 'user@example.com',
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapUsername: 'user@example.com',
        encryptedImapPassword: 'encrypted-password',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{}'),
        json: vi.fn().mockResolvedValue({}),
      } as any);

      const result = await emailConnectionService.syncToStageUpdater(mockConnection);

      expect(result.success).toBe(true);

      // Verify IMAP credentials were sent
      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.credentials.imapHost).toBe('imap.example.com');
      expect(body.credentials.imapPort).toBe(993);
      expect(body.credentials.imapUsername).toBe('user@example.com');
      expect(body.credentials.imapPassword).toBe('decrypted-imap-password');
    });

    it('should throw error when STAGE_UPDATER_SERVICE_URL is not configured', async () => {
      delete process.env.STAGE_UPDATER_SERVICE_URL;

      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        provider: 'gmail',
        email: 'user@gmail.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      await expect(
        emailConnectionService.syncToStageUpdater(mockConnection)
      ).rejects.toThrow('Stage updater service URL not configured');
    });

    it('should throw error when stage updater returns non-ok response', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        provider: 'gmail',
        email: 'user@gmail.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('Stage updater error'),
      } as any);

      await expect(
        emailConnectionService.syncToStageUpdater(mockConnection)
      ).rejects.toThrow('Stage updater sync failed: Stage updater error');
    });

    it('should include API key in request headers', async () => {
      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        provider: 'gmail',
        email: 'user@gmail.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{}'),
        json: vi.fn().mockResolvedValue({}),
      } as any);

      await emailConnectionService.syncToStageUpdater(mockConnection);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      expect(fetchCall[1]?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'X-Service-Key': 'test-api-key',
      });
    });

    it('should send empty string for API key if not configured', async () => {
      delete process.env.STAGE_UPDATER_API_KEY;

      const mockConnection = {
        id: 'conn-123',
        userId: 'user-123',
        provider: 'gmail',
        email: 'user@gmail.com',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: 'encrypted-refresh',
        encryptionIv: 'test-iv',
      };

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{}'),
        json: vi.fn().mockResolvedValue({}),
      } as any);

      await emailConnectionService.syncToStageUpdater(mockConnection);

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      expect(fetchCall[1]?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'X-Service-Key': '',
      });
    });
  });
});
