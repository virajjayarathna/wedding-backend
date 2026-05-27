import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import {
  getPresignedUploadUrl,
  deleteS3Object,
  extractKeyFromUrl,
  AllowedMimeType,
  UploadPurpose,
} from '../services/s3.service';

// ─── Validation Schemas ────────────────────────────────────────────────────────

const upsertWeddingSchema = z.object({
  brideName: z.string().min(1),
  groomName: z.string().min(1),
  weddingDate: z.string().datetime({ offset: true }),
  weddingSlug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  loveStory: z.string().optional(),
  coverPhotoUrl: z.string().optional().nullable(),
  heroPhotoUrl: z.string().optional().nullable(),
  galleryUrls: z.array(z.string()).optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  venueMapsUrl: z.string().optional().nullable(),
  bridePhone: z.string().optional(),
  groomPhone: z.string().optional(),
  musicUrl: z.string().optional().nullable(),
  musicType: z.enum(['SPOTIFY', 'UPLOAD']).optional().nullable(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  fontFamily: z.string().optional(),
});

const timelineSchema = z.array(
  z.object({
    time: z.string(),
    title: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })
);

const uploadUrlSchema = z.object({
  fileType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
  ]),
  purpose: z.enum(['cover', 'hero', 'gallery', 'audio']),
});

// ─── Controllers ───────────────────────────────────────────────────────────────

export async function getWedding(req: Request, res: Response) {
  const wedding = await prisma.weddingDetails.findUnique({
    where: { adminId: req.user!.id },
    include: { _count: { select: { guests: true } } },
  });
  res.json({ success: true, data: wedding });
}

export async function upsertWedding(req: Request, res: Response) {
  const body = upsertWeddingSchema.parse(req.body);

  // Check slug uniqueness (exclude own record)
  const existing = await prisma.weddingDetails.findFirst({
    where: { weddingSlug: body.weddingSlug, adminId: { not: req.user!.id } },
  });
  if (existing) {
    throw ApiError.conflict(
      'This wedding URL slug is already taken. Please choose another.'
    );
  }

  const wedding = await prisma.weddingDetails.upsert({
    where: { adminId: req.user!.id },
    create: {
      adminId: req.user!.id,
      ...body,
      weddingDate: new Date(body.weddingDate),
    },
    update: {
      ...body,
      weddingDate: new Date(body.weddingDate),
    },
  });

  res.json({ success: true, data: wedding });
}

export async function updateTimeline(req: Request, res: Response) {
  const timeline = timelineSchema.parse(req.body.timeline);

  const wedding = await prisma.weddingDetails.findUnique({
    where: { adminId: req.user!.id },
  });
  if (!wedding) {
    throw ApiError.notFound(
      'Wedding details not found. Please create your wedding page first.'
    );
  }

  const updated = await prisma.weddingDetails.update({
    where: { adminId: req.user!.id },
    data: { timeline },
  });

  res.json({ success: true, data: { timeline: updated.timeline } });
}

/**
 * Returns a presigned S3 URL so the frontend can upload directly to S3.
 * After the upload, the frontend should save the returned `publicUrl` via PUT /admin/wedding.
 */
export async function getUploadUrl(req: Request, res: Response) {
  const { fileType, purpose } = uploadUrlSchema.parse(req.body);

  const { uploadUrl, publicUrl, key } = await getPresignedUploadUrl(
    req.user!.id,
    purpose as UploadPurpose,
    fileType as AllowedMimeType
  );

  res.json({
    success: true,
    data: {
      uploadUrl,   // PUT to this URL with the file binary
      publicUrl,   // Save this URL in the wedding record after upload
      key,         // S3 key (for future deletion)
      expiresIn: 900, // seconds
    },
  });
}

/**
 * Remove a photo from the galleryUrls array and delete from S3.
 * Accepts the S3 key (URL-encoded) as a path param.
 */
export async function deleteGalleryPhoto(req: Request, res: Response) {
  const wedding = await prisma.weddingDetails.findUnique({
    where: { adminId: req.user!.id },
  });
  if (!wedding) throw ApiError.notFound('Wedding not found');

  const rawKey = decodeURIComponent(req.params.key as string);

  // Remove the URL from galleryUrls (match by key substring or full URL)
  const updatedGallery = wedding.galleryUrls.filter(
    (url) => !url.includes(rawKey)
  );

  await prisma.weddingDetails.update({
    where: { adminId: req.user!.id },
    data: { galleryUrls: updatedGallery },
  });

  // Delete from S3 — extract key from full URL if needed
  const s3Key = rawKey.startsWith('http') ? (extractKeyFromUrl(rawKey) ?? rawKey) : rawKey;
  try {
    await deleteS3Object(s3Key);
  } catch (err) {
    // Log but don't fail — DB is already updated
    console.error('S3 delete failed (non-fatal):', err);
  }

  res.json({ success: true, message: 'Photo removed from gallery' });
}

export async function togglePublish(req: Request, res: Response) {
  const wedding = await prisma.weddingDetails.findUnique({
    where: { adminId: req.user!.id },
  });
  if (!wedding) throw ApiError.notFound('Wedding not found');

  const updated = await prisma.weddingDetails.update({
    where: { adminId: req.user!.id },
    data: { isPublished: !wedding.isPublished },
    select: { isPublished: true, weddingSlug: true },
  });

  res.json({ success: true, data: updated });
}
