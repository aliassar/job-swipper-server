import crypto from 'crypto';

/**
 * Encryption utility for securing sensitive data using AES-GCM
 * 
 * AES-GCM provides both confidentiality and authenticity
 * It uses a 256-bit key and produces a 12-byte IV (initialization vector)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM

// Cache the decoded encryption key to avoid repeated parsing
let cachedEncryptionKey: Buffer | null = null;

/**
 * Get the encryption key from environment variable
 * The key should be 32 bytes (256 bits) for AES-256
 * The key is cached after first access for performance
 */
function getEncryptionKey(): Buffer {
  // Return cached key if available
  if (cachedEncryptionKey) {
    return cachedEncryptionKey;
  }

  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  
  // The key should be base64 encoded in the environment variable
  const keyBuffer = Buffer.from(key, 'base64');
  
  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded');
  }
  
  // Cache the key for future use
  cachedEncryptionKey = keyBuffer;
  
  return keyBuffer;
}

/**
 * Generate a random encryption key (for setup/testing)
 * Returns a base64-encoded 256-bit key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Helper function to encrypt with a provided IV
 * Used internally by encrypt() and encryptCredentials()
 */
function encryptWithIv(plaintext: string, ivBase64: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Combine encrypted data and auth tag
  return encrypted + ':' + authTag.toString('base64');
}

/**
 * Encrypt a string value using AES-256-GCM
 * 
 * @param plaintext - The value to encrypt
 * @returns Object containing the encrypted data and IV
 */
export function encrypt(plaintext: string): { encryptedData: string; iv: string } {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty value');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const ivBase64 = iv.toString('base64');
  const encryptedData = encryptWithIv(plaintext, ivBase64);
  
  return {
    encryptedData,
    iv: ivBase64,
  };
}

/**
 * Decrypt a value that was encrypted with the encrypt function
 * 
 * @param encryptedData - The encrypted data (includes auth tag)
 * @param iv - The initialization vector used during encryption
 * @returns The decrypted plaintext
 */
export function decrypt(encryptedData: string, iv: string): string {
  if (!encryptedData || !iv) {
    throw new Error('Cannot decrypt without encrypted data and IV');
  }

  const key = getEncryptionKey();
  const ivBuffer = Buffer.from(iv, 'base64');
  
  // Split encrypted data and auth tag
  const parts = encryptedData.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [encrypted, authTagBase64] = parts;
  const authTag = Buffer.from(authTagBase64, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Encrypt credentials object
 * Only encrypts non-null values
 */
export function encryptCredentials(credentials: {
  accessToken?: string | null;
  refreshToken?: string | null;
  imapPassword?: string | null;
}): {
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  encryptedImapPassword?: string;
  encryptionIv?: string;
} {
  // Generate a single IV for all credentials in this set
  const iv = crypto.randomBytes(IV_LENGTH).toString('base64');
  const result: any = {};

  if (credentials.accessToken) {
    const encrypted = encryptWithIv(credentials.accessToken, iv);
    result.encryptedAccessToken = encrypted;
  }

  if (credentials.refreshToken) {
    const encrypted = encryptWithIv(credentials.refreshToken, iv);
    result.encryptedRefreshToken = encrypted;
  }

  if (credentials.imapPassword) {
    const encrypted = encryptWithIv(credentials.imapPassword, iv);
    result.encryptedImapPassword = encrypted;
  }

  // Only set IV if we encrypted at least one field
  if (Object.keys(result).length > 0) {
    result.encryptionIv = iv;
  }

  return result;
}

/**
 * Decrypt credentials object
 */
export function decryptCredentials(encryptedCredentials: {
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
  encryptedImapPassword?: string | null;
  encryptionIv?: string | null;
}): {
  accessToken?: string;
  refreshToken?: string;
  imapPassword?: string;
} {
  const result: any = {};
  const iv = encryptedCredentials.encryptionIv;

  if (!iv) {
    return result;
  }

  if (encryptedCredentials.encryptedAccessToken) {
    result.accessToken = decrypt(encryptedCredentials.encryptedAccessToken, iv);
  }

  if (encryptedCredentials.encryptedRefreshToken) {
    result.refreshToken = decrypt(encryptedCredentials.encryptedRefreshToken, iv);
  }

  if (encryptedCredentials.encryptedImapPassword) {
    result.imapPassword = decrypt(encryptedCredentials.encryptedImapPassword, iv);
  }

  return result;
}
