import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env';

// ─── S3 Client Singleton ───────────────────────────────────────────────────────
// requestChecksumCalculation: 'WHEN_REQUIRED' disables the SDK v3 default
// behaviour of auto-adding CRC32 checksums to presigned PUT URLs. Without this,
// the generated URL contains x-amz-checksum-crc32 & x-amz-sdk-checksum-algorithm
// params that the browser fetch() won't satisfy, causing S3 to reject the upload.
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

export type UploadPurpose = 'cover' | 'hero' | 'gallery' | 'audio';
export type AllowedMimeType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'audio/mpeg'
  | 'audio/mp3'
  | 'audio/ogg';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
};

/**
 * Generate an S3 key for a file upload.
 * Pattern: assets/weddings/{adminId}/{purpose}/{timestamp}-{random}.{ext}
 */
export function buildS3Key(adminId: string, purpose: UploadPurpose, mimeType: string): string {
  const ext = MIME_TO_EXT[mimeType] || 'bin';
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `assets/weddings/${adminId}/${purpose}/${timestamp}-${rand}.${ext}`;
}

/**
 * Build the URL to serve a given S3 key.
 * By default routes through the backend /v1/media proxy so images
 * are always accessible regardless of S3 bucket ACL settings.
 * Set AWS_CDN_BASE_URL to a CloudFront/CDN URL to bypass the proxy.
 */
export function buildPublicUrl(key: string): string {
  return `${config.aws.mediaProxyBaseUrl}/v1/media/${key}`;
}

/**
 * Upload a file buffer directly to S3 from the backend (avoids browser CORS).
 *
 * @returns { publicUrl, key }
 */
export async function uploadFileToS3(
  adminId: string,
  purpose: UploadPurpose,
  mimeType: AllowedMimeType,
  buffer: Buffer
): Promise<{ publicUrl: string; key: string }> {
  const key = buildS3Key(adminId, purpose, mimeType);

  const command = new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    CacheControl: 'max-age=31536000',
    // ACL removed — bucket has "Object Ownership: Bucket owner enforced" which
    // disables all ACLs. Images are served via the /v1/media/ proxy instead.
  });

  await s3Client.send(command);

  const publicUrl = buildPublicUrl(key);
  return { publicUrl, key };
}

/**
 * Generate a presigned URL for a client-side direct upload to S3.
 * The client uploads directly to S3 — the backend never handles the binary.
 *
 * @returns { uploadUrl, publicUrl, key }
 */
export async function getPresignedUploadUrl(
  adminId: string,
  purpose: UploadPurpose,
  mimeType: AllowedMimeType
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const key = buildS3Key(adminId, purpose, mimeType);

  const command = new PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
    ContentType: mimeType,
    // Cache control for CDN
    CacheControl: 'max-age=31536000',
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: config.aws.presignedUrlExpires,
  });

  const publicUrl = buildPublicUrl(key);

  return { uploadUrl, publicUrl, key };
}

/**
 * Generate a presigned GET URL for a private object (not needed for public assets,
 * but useful if bucket is private).
 */
export async function getPresignedReadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

/**
 * Permanently delete an object from S3.
 */
export async function deleteS3Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: key,
  });
  await s3Client.send(command);
}

/**
 * Extract the S3 key from a full CDN/public URL.
 * e.g. "https://s3-wedding-app.s3.us-east-1.amazonaws.com/assets/weddings/.../photo.jpg"
 *   → "assets/weddings/.../photo.jpg"
 */
export function extractKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Remove leading slash from pathname
    return parsed.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}
