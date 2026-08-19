import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';
import {
  uploadFileToS3,
  deleteS3Object,
  extractKeyFromUrl,
  AllowedMimeType,
  UploadPurpose,
  buildPublicUrl,
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
  sharePreviewUrl: z.string().optional().nullable(),
  galleryUrls: z.array(z.string()).optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  venueMapsUrl: z.string().optional().nullable(),
  bridePhone: z.string().optional(),
  groomPhone: z.string().optional(),
  brideFatherName: z.string().optional().nullable(),
  brideFatherPhone: z.string().optional().nullable(),
  groomFatherName: z.string().optional().nullable(),
  groomFatherPhone: z.string().optional().nullable(),
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
  pdfLogoUrl: z.string().optional().nullable(),
  pdfFont: z.string().optional(),
  pdfWeddingDay: z.string().optional(),
  pdfStartTime: z.string().optional(),
  pdfEndTime: z.string().optional(),
  pdfCeremonyName: z.string().optional(),
  pdfCeremonyTime: z.string().optional(),
  rsvpDeadline: z.string().datetime({ offset: true }).optional().nullable(),
  rsvpContacts: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        phone: z.string().min(1),
      })
    )
    .max(8, 'You can add up to 8 RSVP contacts.')
    .optional(),
});

const timelineSchema = z.array(
  z.object({
    time: z.string(),
    title: z.string(),
    description: z.string().optional(),
    icon: z.string().optional(),
  })
);

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3', 'audio/ogg'] as const;
const ALLOWED_PURPOSES = ['cover', 'hero', 'gallery', 'audio', 'logo', 'share'] as const;

/**
 * Upload purposes that map 1:1 onto a single URL column on WeddingDetails.
 * Expressed as a lookup rather than a chain of ifs so adding another
 * single-image slot later stays a one-line change.
 */
const SINGLE_IMAGE_FIELDS: Record<string, string> = {
  cover: 'coverPhotoUrl',
  hero: 'heroPhotoUrl',
  logo: 'pdfLogoUrl',
  share: 'sharePreviewUrl',
};

// ─── Controllers ───────────────────────────────────────────────────────────────

export async function getWedding(req: Request, res: Response) {
  const wedding = await prisma.weddingDetails.findUnique({
    where: { adminId: req.user!.id },
    include: { _count: { select: { guests: true } } },
  });

  if (wedding) {
    // Transform stored S3 URLs to proxy URLs for backward compatibility
    const toProxyUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      const key = extractKeyFromUrl(url);
      if (!key) return url;
      return `${config.aws.mediaProxyBaseUrl}/v1/media/${key}`;
    };
    const withProxied = {
      ...wedding,
      coverPhotoUrl: toProxyUrl(wedding.coverPhotoUrl),
      heroPhotoUrl: toProxyUrl(wedding.heroPhotoUrl),
      sharePreviewUrl: toProxyUrl(wedding.sharePreviewUrl),
      // pdfLogoUrl was previously returned raw — older records stored a direct
      // s3.amazonaws.com URL, which 403s now that the bucket blocks public
      // access, so route it through the media proxy like every other asset.
      pdfLogoUrl: toProxyUrl(wedding.pdfLogoUrl),
      galleryUrls: wedding.galleryUrls.map((u) => toProxyUrl(u) ?? u),
      musicUrl: toProxyUrl(wedding.musicUrl),
    };
    return res.json({ success: true, data: withProxied });
  }

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
 * Accepts a multipart file upload, streams it to S3 server-side, then saves
 * the public URL into the wedding record. No browser-to-S3 CORS required.
 */
export async function uploadPhoto(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw ApiError.badRequest('No file provided');

  const purpose = req.body.purpose as string;
  if (!ALLOWED_PURPOSES.includes(purpose as typeof ALLOWED_PURPOSES[number])) {
    throw ApiError.badRequest(
      `Invalid purpose. Must be one of: ${ALLOWED_PURPOSES.join(', ')}`
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype as typeof ALLOWED_MIME_TYPES[number])) {
    throw ApiError.badRequest('Invalid file type. Allowed: JPEG, PNG, WebP, MP3, OGG');
  }

  const { publicUrl } = await uploadFileToS3(
    req.user!.id,
    purpose as UploadPurpose,
    file.mimetype as AllowedMimeType,
    file.buffer
  );

  // Save URL into the wedding record based on purpose
  const singleImageField = SINGLE_IMAGE_FIELDS[purpose];
  if (singleImageField) {
    const field: string = singleImageField;
    // Fetch the current URL so we can delete the old S3 object
    const existing = await prisma.weddingDetails.findUnique({
      where: { adminId: req.user!.id },
      select: { [field]: true },
    });
    const oldUrl = existing?.[field as keyof typeof existing] as string | null | undefined;

    await prisma.weddingDetails.updateMany({
      where: { adminId: req.user!.id },
      data: { [field]: publicUrl },
    });

    // Delete the old S3 object if it existed (non-fatal)
    if (oldUrl) {
      const oldKey = extractKeyFromUrl(oldUrl);
      if (oldKey) {
        try {
          await deleteS3Object(oldKey);
        } catch (err) {
          console.error('Failed to delete old S3 object (non-fatal):', err);
        }
      }
    }
  } else if (purpose === 'audio') {
    // Save musicUrl + set musicType to UPLOAD, delete old audio if any
    const existing = await prisma.weddingDetails.findUnique({
      where: { adminId: req.user!.id },
      select: { musicUrl: true },
    });
    const oldUrl = existing?.musicUrl;

    await prisma.weddingDetails.updateMany({
      where: { adminId: req.user!.id },
      data: { musicUrl: publicUrl, musicType: 'UPLOAD' },
    });

    // Delete old audio file from S3 (non-fatal)
    if (oldUrl) {
      const oldKey = extractKeyFromUrl(oldUrl);
      if (oldKey) {
        try {
          await deleteS3Object(oldKey);
        } catch (err) {
          console.error('Failed to delete old audio S3 object (non-fatal):', err);
        }
      }
    }
  } else if (purpose === 'gallery') {
    // Append to galleryUrls array
    const existing = await prisma.weddingDetails.findUnique({
      where: { adminId: req.user!.id },
      select: { galleryUrls: true },
    });
    const currentUrls = existing?.galleryUrls || [];

    await prisma.weddingDetails.updateMany({
      where: { adminId: req.user!.id },
      data: { galleryUrls: [...currentUrls, publicUrl] },
    });
  }

  res.json({ success: true, data: { publicUrl } });
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

/**
 * Delete the background music file from S3 and clear musicUrl/musicType from DB.
 */
export async function deleteMusic(req: Request, res: Response) {
  const wedding = await prisma.weddingDetails.findUnique({
    where: { adminId: req.user!.id },
    select: { musicUrl: true },
  });
  if (!wedding) throw ApiError.notFound('Wedding not found');

  // Delete from S3 if URL exists
  if (wedding.musicUrl) {
    const key = extractKeyFromUrl(wedding.musicUrl);
    if (key) {
      try {
        await deleteS3Object(key);
      } catch (err) {
        console.error('S3 music delete failed (non-fatal):', err);
      }
    }
  }

  // Clear musicUrl and musicType from DB
  await prisma.weddingDetails.updateMany({
    where: { adminId: req.user!.id },
    data: { musicUrl: null, musicType: null },
  });

  res.json({ success: true, message: 'Background music removed' });
}
