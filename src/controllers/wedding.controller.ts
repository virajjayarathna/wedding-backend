import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

const upsertWeddingSchema = z.object({
  brideName: z.string().min(1),
  groomName: z.string().min(1),
  weddingDate: z.string().datetime({ offset: true }),
  weddingSlug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  loveStory: z.string().optional(),
  coverPhotoUrl: z.string().url().optional().or(z.literal('')),
  heroPhotoUrl: z.string().url().optional().or(z.literal('')),
  galleryUrls: z.array(z.string().url()).optional(),
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  venueMapsUrl: z.string().url().optional().or(z.literal('')),
  bridePhone: z.string().optional(),
  groomPhone: z.string().optional(),
  musicUrl: z.string().optional(),
  musicType: z.enum(['SPOTIFY', 'UPLOAD']).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().optional(),
});

const timelineSchema = z.array(z.object({
  time: z.string(),
  title: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
}));

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
  if (existing) throw ApiError.conflict('This wedding URL slug is already taken. Please choose another.');

  const wedding = await prisma.weddingDetails.upsert({
    where: { adminId: req.user!.id },
    create: { adminId: req.user!.id, ...body, weddingDate: new Date(body.weddingDate) },
    update: { ...body, weddingDate: new Date(body.weddingDate) },
  });

  res.json({ success: true, data: wedding });
}

export async function updateTimeline(req: Request, res: Response) {
  const timeline = timelineSchema.parse(req.body.timeline);

  const wedding = await prisma.weddingDetails.findUnique({ where: { adminId: req.user!.id } });
  if (!wedding) throw ApiError.notFound('Wedding details not found. Please create your wedding page first.');

  const updated = await prisma.weddingDetails.update({
    where: { adminId: req.user!.id },
    data: { timeline },
  });

  res.json({ success: true, data: { timeline: updated.timeline } });
}

export async function getUploadUrl(req: Request, res: Response) {
  const { fileType, purpose } = z.object({
    fileType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    purpose: z.enum(['cover', 'hero', 'gallery']),
  }).parse(req.body);

  const ext = fileType.split('/')[1];
  const key = `weddings/${req.user!.id}/${purpose}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // In Step 2, replace this with actual AWS SDK presigned URL generation
  const uploadUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  const publicUrl = `${process.env.AWS_CDN_BASE_URL}/${key}`;

  res.json({ success: true, data: { uploadUrl, publicUrl, key } });
}

export async function deleteGalleryPhoto(req: Request, res: Response) {
  const { key } = req.params;

  const wedding = await prisma.weddingDetails.findUnique({ where: { adminId: req.user!.id } });
  if (!wedding) throw ApiError.notFound('Wedding not found');

  // Remove from galleryUrls array
  const updatedGallery = wedding.galleryUrls.filter((url) => !url.includes(decodeURIComponent(key)));

  await prisma.weddingDetails.update({
    where: { adminId: req.user!.id },
    data: { galleryUrls: updatedGallery },
  });

  // In Step 2, also delete from S3 here

  res.json({ success: true, message: 'Photo removed from gallery' });
}

export async function togglePublish(req: Request, res: Response) {
  const wedding = await prisma.weddingDetails.findUnique({ where: { adminId: req.user!.id } });
  if (!wedding) throw ApiError.notFound('Wedding not found');

  const updated = await prisma.weddingDetails.update({
    where: { adminId: req.user!.id },
    data: { isPublished: !wedding.isPublished },
    select: { isPublished: true, weddingSlug: true },
  });

  res.json({ success: true, data: updated });
}
