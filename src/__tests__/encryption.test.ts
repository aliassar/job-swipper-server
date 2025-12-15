import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, encryptCredentials, decryptCredentials, generateEncryptionKey } from '../lib/encryption';

describe('Encryption Utilities', () => {
  beforeAll(() => {
    // Set a test encryption key
    process.env.ENCRYPTION_KEY = generateEncryptionKey();
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string successfully', () => {
      const plaintext = 'my-secret-access-token';
      const { encryptedData, iv } = encrypt(plaintext);

      expect(encryptedData).toBeTruthy();
      expect(iv).toBeTruthy();
      expect(encryptedData).not.toBe(plaintext);

      const decrypted = decrypt(encryptedData, iv);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted outputs for same input (different IVs)', () => {
      const plaintext = 'test-token';
      const result1 = encrypt(plaintext);
      const result2 = encrypt(plaintext);

      // Different IVs should produce different encrypted outputs
      expect(result1.encryptedData).not.toBe(result2.encryptedData);
      expect(result1.iv).not.toBe(result2.iv);

      // But both should decrypt to the same value
      expect(decrypt(result1.encryptedData, result1.iv)).toBe(plaintext);
      expect(decrypt(result2.encryptedData, result2.iv)).toBe(plaintext);
    });

    it('should throw error when decrypting with wrong IV', () => {
      const plaintext = 'test-token';
      const { encryptedData } = encrypt(plaintext);
      const { iv: wrongIv } = encrypt('another-token');

      expect(() => decrypt(encryptedData, wrongIv)).toThrow();
    });

    it('should throw error when encrypting empty string', () => {
      expect(() => encrypt('')).toThrow('Cannot encrypt empty value');
    });

    it('should throw error when decrypting without IV', () => {
      const { encryptedData } = encrypt('test');
      expect(() => decrypt(encryptedData, '')).toThrow();
    });
  });

  describe('encryptCredentials and decryptCredentials', () => {
    it('should encrypt and decrypt OAuth credentials', () => {
      const credentials = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
      };

      const encrypted = encryptCredentials(credentials);

      expect(encrypted.encryptedAccessToken).toBeTruthy();
      expect(encrypted.encryptedRefreshToken).toBeTruthy();
      expect(encrypted.encryptionIv).toBeTruthy();

      const decrypted = decryptCredentials({
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        encryptionIv: encrypted.encryptionIv,
      });

      expect(decrypted.accessToken).toBe(credentials.accessToken);
      expect(decrypted.refreshToken).toBe(credentials.refreshToken);
    });

    it('should encrypt and decrypt IMAP password', () => {
      const credentials = {
        imapPassword: 'imap-password-789',
      };

      const encrypted = encryptCredentials(credentials);

      expect(encrypted.encryptedImapPassword).toBeTruthy();
      expect(encrypted.encryptionIv).toBeTruthy();

      const decrypted = decryptCredentials({
        encryptedImapPassword: encrypted.encryptedImapPassword,
        encryptionIv: encrypted.encryptionIv,
      });

      expect(decrypted.imapPassword).toBe(credentials.imapPassword);
    });

    it('should handle partial credentials', () => {
      const credentials = {
        accessToken: 'access-token-only',
        refreshToken: null,
      };

      const encrypted = encryptCredentials(credentials);

      expect(encrypted.encryptedAccessToken).toBeTruthy();
      expect(encrypted.encryptedRefreshToken).toBeUndefined();
      expect(encrypted.encryptionIv).toBeTruthy();

      const decrypted = decryptCredentials({
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptionIv: encrypted.encryptionIv,
      });

      expect(decrypted.accessToken).toBe(credentials.accessToken);
      expect(decrypted.refreshToken).toBeUndefined();
    });

    it('should use same IV for all credentials in a set', () => {
      const credentials = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        imapPassword: 'imap-password',
      };

      const encrypted = encryptCredentials(credentials);
      
      // All encrypted fields should use the same IV
      expect(encrypted.encryptionIv).toBeTruthy();

      // Decrypt each field individually to verify they all work with same IV
      const decrypted = decryptCredentials({
        encryptedAccessToken: encrypted.encryptedAccessToken,
        encryptedRefreshToken: encrypted.encryptedRefreshToken,
        encryptedImapPassword: encrypted.encryptedImapPassword,
        encryptionIv: encrypted.encryptionIv,
      });

      expect(decrypted.accessToken).toBe(credentials.accessToken);
      expect(decrypted.refreshToken).toBe(credentials.refreshToken);
      expect(decrypted.imapPassword).toBe(credentials.imapPassword);
    });

    it('should return empty object when no IV provided for decryption', () => {
      const decrypted = decryptCredentials({
        encryptedAccessToken: 'some-encrypted-value',
        encryptionIv: null,
      });

      expect(decrypted).toEqual({});
    });

    it('should not set IV when no credentials to encrypt', () => {
      const encrypted = encryptCredentials({
        accessToken: null,
        refreshToken: null,
      });

      expect(encrypted.encryptionIv).toBeUndefined();
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a valid 256-bit base64 key', () => {
      const key = generateEncryptionKey();
      const keyBuffer = Buffer.from(key, 'base64');
      
      expect(keyBuffer.length).toBe(32); // 256 bits
    });

    it('should generate different keys each time', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      
      expect(key1).not.toBe(key2);
    });
  });
});
