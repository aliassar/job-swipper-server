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

const BUCKET = process.env.S3_BUCKET || '';

export const storage = {
  async uploadFile(key: string, buffer: Buffer, contentType: string): Promise<string> {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return `https://${BUCKET}.${process.env.S3_ENDPOINT}/${key}`;
  },

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  },

  async getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // Alias for getSignedUrl
    return this.getSignedUrl(key, expiresIn);
  },

  async deleteFile(key: string): Promise<void> {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );
  },

  generateKey(userId: string, type: 'resume' | 'generated-resume' | 'cover-letter' | 'base-resume' | 'base-cover-letter', filename: string): string {
    const timestamp = Date.now();
    return `${type}/${userId}/${timestamp}-${filename}`;
  },
};
