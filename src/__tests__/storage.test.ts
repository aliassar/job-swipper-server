import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the AWS SDK modules before importing storage
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}));

// Import storage after mocks are set up
import { storage } from '../lib/storage';

describe('Storage S3 Configuration Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset process.env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateS3Config', () => {
    it('should throw error when S3_ACCESS_KEY is missing', async () => {
      delete process.env.S3_ACCESS_KEY;
      
      const buffer = Buffer.from('test');
      await expect(storage.uploadFile('test/file.pdf', buffer, 'application/pdf'))
        .rejects.toThrow('S3 configuration incomplete. Please set S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_ENDPOINT');
    });

    it('should throw error when S3_SECRET_KEY is missing', async () => {
      process.env.S3_ACCESS_KEY = 'test-key';
      delete process.env.S3_SECRET_KEY;
      
      const buffer = Buffer.from('test');
      await expect(storage.uploadFile('test/file.pdf', buffer, 'application/pdf'))
        .rejects.toThrow('S3 configuration incomplete');
    });

    it('should throw error when S3_BUCKET is missing', async () => {
      process.env.S3_ACCESS_KEY = 'test-key';
      process.env.S3_SECRET_KEY = 'test-secret';
      delete process.env.S3_BUCKET;
      
      const buffer = Buffer.from('test');
      await expect(storage.uploadFile('test/file.pdf', buffer, 'application/pdf'))
        .rejects.toThrow('S3 configuration incomplete');
    });

    it('should throw error when S3_ENDPOINT is missing', async () => {
      process.env.S3_ACCESS_KEY = 'test-key';
      process.env.S3_SECRET_KEY = 'test-secret';
      process.env.S3_BUCKET = 'test-bucket';
      delete process.env.S3_ENDPOINT;
      
      const buffer = Buffer.from('test');
      await expect(storage.uploadFile('test/file.pdf', buffer, 'application/pdf'))
        .rejects.toThrow('S3 configuration incomplete');
    });

    it('should validate config before deleteFile', async () => {
      delete process.env.S3_ACCESS_KEY;
      
      await expect(storage.deleteFile('test/file.pdf'))
        .rejects.toThrow('S3 configuration incomplete');
    });

    it('should validate config before getSignedUrl', async () => {
      delete process.env.S3_BUCKET;
      
      await expect(storage.getSignedUrl('test/file.pdf'))
        .rejects.toThrow('S3 configuration incomplete');
    });

    it('should validate config before getPresignedUrl', async () => {
      delete process.env.S3_ENDPOINT;
      
      await expect(storage.getPresignedUrl('test/file.pdf'))
        .rejects.toThrow('S3 configuration incomplete');
    });
  });

  describe('storage methods with valid config', () => {
    beforeEach(() => {
      process.env.S3_ACCESS_KEY = 'test-access-key';
      process.env.S3_SECRET_KEY = 'test-secret-key';
      process.env.S3_BUCKET = 'test-bucket';
      process.env.S3_ENDPOINT = 's3.amazonaws.com';
    });

    it('should successfully delete file with valid config', async () => {
      await expect(storage.deleteFile('test/file.pdf')).resolves.not.toThrow();
    });

    it('should successfully get signed URL with valid config', async () => {
      const url = await storage.getSignedUrl('test/file.pdf', 3600);
      expect(url).toBe('https://signed-url.example.com');
    });

    it('should successfully get presigned URL with valid config', async () => {
      const url = await storage.getPresignedUrl('test/file.pdf', 7200);
      expect(url).toBe('https://signed-url.example.com');
    });
  });

  describe('generateKey', () => {
    it('should generate key without validation', () => {
      // generateKey should not require S3 config validation
      delete process.env.S3_ACCESS_KEY;
      
      const key = storage.generateKey('user123', 'resume', 'myfile.pdf');
      expect(key).toMatch(/^resume\/user123\/\d+-myfile\.pdf$/);
    });
  });
});

// Test the URL generation logic by testing the actual output
describe('Storage S3 URL Format', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // Set all required env vars
    process.env.S3_ACCESS_KEY = 'test-access-key';
    process.env.S3_SECRET_KEY = 'test-secret-key';
    process.env.S3_BUCKET = 'test-bucket';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should generate AWS-style URL for standard AWS endpoint', async () => {
    process.env.S3_ENDPOINT = 's3.amazonaws.com';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('test/file.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('https://test-bucket.s3.amazonaws.com/test/file.pdf');
  });

  it('should generate URL for full URL endpoint (Cloudflare R2 style)', async () => {
    process.env.S3_ENDPOINT = 'https://account-id.r2.cloudflarestorage.com';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('test/file.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('https://account-id.r2.cloudflarestorage.com/test-bucket/test/file.pdf');
  });

  it('should generate URL for full URL endpoint (MinIO style)', async () => {
    process.env.S3_ENDPOINT = 'https://minio.example.com';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('test/file.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('https://minio.example.com/test-bucket/test/file.pdf');
  });

  it('should handle endpoint with trailing slash', async () => {
    process.env.S3_ENDPOINT = 'https://minio.example.com/';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('test/file.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('https://minio.example.com/test-bucket/test/file.pdf');
  });

  it('should handle custom domain endpoint without protocol', async () => {
    process.env.S3_ENDPOINT = 's3.custom-domain.com';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('test/file.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('https://test-bucket.s3.custom-domain.com/test/file.pdf');
  });

  it('should handle endpoint with http protocol', async () => {
    process.env.S3_ENDPOINT = 'http://localhost:9000';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('test/file.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('http://localhost:9000/test-bucket/test/file.pdf');
  });

  it('should handle AWS regional endpoint', async () => {
    process.env.S3_ENDPOINT = 's3.us-west-2.amazonaws.com';
    
    const buffer = Buffer.from('test');
    const url = await storage.uploadFile('my-docs/resume.pdf', buffer, 'application/pdf');
    
    expect(url).toBe('https://test-bucket.s3.us-west-2.amazonaws.com/my-docs/resume.pdf');
  });
});
