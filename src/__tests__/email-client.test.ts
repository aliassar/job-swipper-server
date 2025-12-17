import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('EmailClient', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear module cache to get fresh instance
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.resetModules();
  });

  describe('sendEmail - unconfigured transporter', () => {
    it('should throw error when transporter is not configured', async () => {
      // Set up environment without SMTP config
      process.env.SMTP_HOST = '';
      process.env.SMTP_USER = '';
      process.env.SMTP_PASS = '';

      // Import EmailClient after clearing SMTP config
      const { emailClient } = await import('../lib/email-client');

      // Attempt to send email
      await expect(
        emailClient.sendEmail({
          to: 'test@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        })
      ).rejects.toThrow('Email transport not configured (email not sent)');
    });
  });

  describe('URL generation - FRONTEND_URL priority', () => {
    it('should use FRONTEND_URL for verification email when available', async () => {
      // Set up environment with both FRONTEND_URL and NEXTAUTH_URL
      process.env.FRONTEND_URL = 'https://frontend.example.com';
      process.env.NEXTAUTH_URL = 'https://api.example.com';
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';
      process.env.FROM_EMAIL = 'noreply@example.com';

      // Import EmailClient with SMTP configured
      const { emailClient } = await import('../lib/email-client');

      // Mock the sendEmail method to capture the HTML content
      const sendEmailSpy = vi.spyOn(emailClient, 'sendEmail');

      try {
        await emailClient.sendVerificationEmail('test@example.com', 'test-token-123');
      } catch {
        // Expected to fail since we don't have a real transporter
        // but we can still check the spy
      }

      expect(sendEmailSpy).toHaveBeenCalled();
      const call = sendEmailSpy.mock.calls[0];
      expect(call[0].html).toContain('https://frontend.example.com/auth/verify-email?token=test-token-123');
    });

    it('should use FRONTEND_URL for password reset email when available', async () => {
      // Set up environment with both FRONTEND_URL and NEXTAUTH_URL
      process.env.FRONTEND_URL = 'https://frontend.example.com';
      process.env.NEXTAUTH_URL = 'https://api.example.com';
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';
      process.env.FROM_EMAIL = 'noreply@example.com';

      // Import EmailClient with SMTP configured
      const { emailClient } = await import('../lib/email-client');

      // Mock the sendEmail method to capture the HTML content
      const sendEmailSpy = vi.spyOn(emailClient, 'sendEmail');

      try {
        await emailClient.sendPasswordResetEmail('test@example.com', 'reset-token-456');
      } catch {
        // Expected to fail since we don't have a real transporter
        // but we can still check the spy
      }

      expect(sendEmailSpy).toHaveBeenCalled();
      const call = sendEmailSpy.mock.calls[0];
      expect(call[0].html).toContain('https://frontend.example.com/auth/reset-password?token=reset-token-456');
    });

    it('should fall back to NEXTAUTH_URL when FRONTEND_URL is not set', async () => {
      // Set up environment with only NEXTAUTH_URL
      delete process.env.FRONTEND_URL;
      process.env.NEXTAUTH_URL = 'https://api.example.com';
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';
      process.env.FROM_EMAIL = 'noreply@example.com';

      // Import EmailClient with SMTP configured
      const { emailClient } = await import('../lib/email-client');

      // Mock the sendEmail method to capture the HTML content
      const sendEmailSpy = vi.spyOn(emailClient, 'sendEmail');

      try {
        await emailClient.sendVerificationEmail('test@example.com', 'test-token-789');
      } catch {
        // Expected to fail since we don't have a real transporter
        // but we can still check the spy
      }

      expect(sendEmailSpy).toHaveBeenCalled();
      const call = sendEmailSpy.mock.calls[0];
      expect(call[0].html).toContain('https://api.example.com/auth/verify-email?token=test-token-789');
    });

    it('should fall back to localhost when neither FRONTEND_URL nor NEXTAUTH_URL is set', async () => {
      // Set up environment without FRONTEND_URL or NEXTAUTH_URL
      delete process.env.FRONTEND_URL;
      delete process.env.NEXTAUTH_URL;
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'password';
      process.env.FROM_EMAIL = 'noreply@example.com';

      // Import EmailClient with SMTP configured
      const { emailClient } = await import('../lib/email-client');

      // Mock the sendEmail method to capture the HTML content
      const sendEmailSpy = vi.spyOn(emailClient, 'sendEmail');

      try {
        await emailClient.sendVerificationEmail('test@example.com', 'test-token-default');
      } catch {
        // Expected to fail since we don't have a real transporter
        // but we can still check the spy
      }

      expect(sendEmailSpy).toHaveBeenCalled();
      const call = sendEmailSpy.mock.calls[0];
      expect(call[0].html).toContain('http://localhost:3000/auth/verify-email?token=test-token-default');
    });
  });
});
