import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
  },
});

function validateS3Config() {
  const { S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_ENDPOINT } = process.env;
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET || !S3_ENDPOINT) {
    throw new Error('S3 configuration incomplete. Please set S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_ENDPOINT');
  }
}

function makeS3PublicUrl(bucket: string, key: string, endpoint: string) {
  if (/^https?:\/\//.test(endpoint)) {
    // Full URL endpoint (e.g., https://r2.dev/:bucket/:key)
    return endpoint.replace(/\/$/, '') + `/${bucket}/${key}`;
  } else {
    // AWS style or custom domain endpoint (e.g., s3.amazonaws.com)
    return `https://${bucket}.${endpoint.replace(/^(https?:\/\/)?/, '').replace(/\/$/, '')}/${key}`;
  }
}

export const storage = {
  async uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
    validateS3Config();
    const bucket = process.env.S3_BUCKET!;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return makeS3PublicUrl(bucket, key, process.env.S3_ENDPOINT!);
  },

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    validateS3Config();
    const bucket = process.env.S3_BUCKET!;
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  },

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Alias for getSignedUrl
    return this.getSignedUrl(key, expiresIn);
  },

  async deleteFile(key: string): Promise<void> {
    validateS3Config();
    const bucket = process.env.S3_BUCKET!;
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  },

  generateKey(userId: string, type: 'resume' | 'generated-resume' | 'cover-letter' | 'base-resume' | 'base-cover-letter', filename: string): string {
    const timestamp = Date.now();
    return `${type}/${userId}/${timestamp}-${filename}`;
  },
};
