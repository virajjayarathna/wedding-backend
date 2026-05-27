import { Router, Request, Response } from 'express';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config/env';
import { Readable } from 'stream';

const router = Router();

// S3 client for proxy reads (uses same credentials as s3.service)
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

/**
 * GET /v1/media/*
 * Proxies any S3 object through the backend so guests can view
 * images even if the bucket has "Block Public Access" enabled.
 *
 * Example: /v1/media/assets/weddings/abc/cover/1234-abc.jpg
 */
router.get('/{*key}', async (req: Request, res: Response) => {
  // req.params.key contains the full path after /v1/media/
  // e.g. "assets/weddings/abc/cover/1234-abc.jpg"
  const key = (req.params as Record<string, string>).key;

  if (!key) {
    res.status(400).json({ success: false, message: 'Missing S3 key' });
    return;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: key,
    });

    const s3Response = await s3Client.send(command);

    // Forward content-type and cache headers
    if (s3Response.ContentType) {
      res.setHeader('Content-Type', s3Response.ContentType);
    }
    if (s3Response.ContentLength) {
      res.setHeader('Content-Length', s3Response.ContentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Stream the S3 body to the client
    if (s3Response.Body instanceof Readable) {
      s3Response.Body.pipe(res);
    } else {
      // AWS SDK v3 returns a ReadableStream in some environments
      const stream = s3Response.Body as unknown as Readable;
      stream.pipe(res);
    }
  } catch (err: unknown) {
    const awsErr = err as { name?: string };
    if (awsErr.name === 'NoSuchKey' || awsErr.name === 'NotFound') {
      res.status(404).json({ success: false, message: 'Media not found' });
    } else {
      console.error('Media proxy error:', err);
      res.status(500).json({ success: false, message: 'Failed to load media' });
    }
  }
});

export default router;
