import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { extractKeyFromUrl } from '../services/s3.service';
import { generateInvitationPdf } from '../services/pdf.service';
import { config } from '../config/env';

const rsvpSchema = z.object({
  rsvpStatus: z.enum(['ATTENDING', 'DECLINING', 'MAYBE']),
  attendingCount: z.number().int().min(1).optional(),
  dietaryNotes: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export async function resolveInvite(req: Request, res: Response) {
  const token = req.params.token as string;

  let guest = await prisma.guest.findUnique({
    where: { token },
    include: { wedding: true },
  });

  if (!guest) {
    const weddingBySlug = await prisma.weddingDetails.findUnique({
      where: { weddingSlug: token },
    });

    if (weddingBySlug) {
      guest = {
        id: 'preview',
        weddingId: weddingBySlug.id,
        title: 'MR',
        firstName: 'Preview',
        lastName: 'Guest',
        phone: null,
        maxAttendants: 2,
        token: token,
        rsvpStatus: 'PENDING',
        attendingCount: null,
        dietaryNotes: null,
        notes: null,
        rsvpSubmittedAt: null,
        brideRsvpContact: 'BRIDE',
        groomRsvpContact: 'GROOM',
        createdAt: new Date(),
        updatedAt: new Date(),
        wedding: weddingBySlug,
      } as any;
    }
  }

  if (!guest) throw ApiError.notFound('This invitation link is invalid or has expired.');

  const weddingDetails = guest.wedding;

  // Check wedding is published
  if (!weddingDetails.isPublished) {
    throw ApiError.notFound('This invitation is not yet available.');
  }

  // Check admin subscription is active
  const admin = await prisma.admin.findUnique({
    where: { id: weddingDetails.adminId },
    select: { status: true, subscriptionEnd: true },
  });

  if (!admin || admin.status !== 'ACTIVE') {
    throw ApiError.notFound('This invitation link is no longer active.');
  }
  if (admin.subscriptionEnd && admin.subscriptionEnd < new Date()) {
    throw ApiError.notFound('This invitation link is no longer active.');
  }

  /**
   * Converts a stored URL to a proxy URL if it points directly to S3.
   * Handles both old s3.amazonaws.com URLs and new proxy URLs transparently.
   */
  function toProxyUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    // Already a proxy URL
    if (url.includes('/v1/media/')) return url;
    // Direct S3 URL — extract key and build proxy URL
    const key = extractKeyFromUrl(url);
    if (!key) return url; // Unknown format, return as-is
    return `${config.aws.mediaProxyBaseUrl}/v1/media/${key}`;
  }

  res.json({
    success: true,
    data: {
      guest: {
        id: guest.id,
        title: guest.title,
        firstName: guest.firstName,
        lastName: guest.lastName,
        maxAttendants: guest.maxAttendants,
        rsvpStatus: guest.rsvpStatus,
        attendingCount: guest.attendingCount,
        dietaryNotes: guest.dietaryNotes,
        rsvpSubmittedAt: guest.rsvpSubmittedAt,
        brideRsvpContact: guest.brideRsvpContact,
        groomRsvpContact: guest.groomRsvpContact,
      },
      wedding: {
        brideName: weddingDetails.brideName,
        groomName: weddingDetails.groomName,
        weddingDate: weddingDetails.weddingDate,
        weddingSlug: weddingDetails.weddingSlug,
        loveStory: weddingDetails.loveStory,
        coverPhotoUrl: toProxyUrl(weddingDetails.coverPhotoUrl),
        heroPhotoUrl: toProxyUrl(weddingDetails.heroPhotoUrl),
        galleryUrls: weddingDetails.galleryUrls.map((u) => toProxyUrl(u) ?? u),
        venueName: weddingDetails.venueName,
        venueAddress: weddingDetails.venueAddress,
        venueMapsUrl: weddingDetails.venueMapsUrl,
        bridePhone: weddingDetails.bridePhone,
        groomPhone: weddingDetails.groomPhone,
        brideFatherName: weddingDetails.brideFatherName,
        brideFatherPhone: weddingDetails.brideFatherPhone,
        groomFatherName: weddingDetails.groomFatherName,
        groomFatherPhone: weddingDetails.groomFatherPhone,
        timeline: weddingDetails.timeline,
        musicUrl: weddingDetails.musicUrl,
        musicType: weddingDetails.musicType,
        primaryColor: weddingDetails.primaryColor,
        accentColor: weddingDetails.accentColor,
        fontFamily: weddingDetails.fontFamily,
      },
    },
  });
}

export async function submitRsvp(req: Request, res: Response) {
  const token = req.params.token as string;
  const body = rsvpSchema.parse(req.body);

  const guest = await prisma.guest.findUnique({
    where: { token },
    include: { wedding: { select: { isPublished: true } } },
  });

  if (!guest) {
    const isPreview = await prisma.weddingDetails.findUnique({ where: { weddingSlug: token } });
    if (isPreview) {
      throw ApiError.badRequest('This is a preview link. RSVPs cannot be submitted here.');
    }
    throw ApiError.notFound('Invalid invitation token.');
  }

  if (!guest.wedding.isPublished) throw ApiError.forbidden('This invitation is not active.');

  // Validate attending count against max
  if (body.rsvpStatus === 'ATTENDING' && body.attendingCount) {
    if (body.attendingCount > guest.maxAttendants) {
      throw ApiError.badRequest(
        `Maximum allowed attendants is ${guest.maxAttendants}. You entered ${body.attendingCount}.`
      );
    }
  }

  const updated = await prisma.guest.update({
    where: { token },
    data: {
      rsvpStatus: body.rsvpStatus,
      attendingCount: body.rsvpStatus === 'ATTENDING' ? (body.attendingCount ?? 1) : null,
      dietaryNotes: body.dietaryNotes,
      notes: body.notes,
      rsvpSubmittedAt: new Date(),
    },
    select: {
      id: true,
      rsvpStatus: true,
      attendingCount: true,
      rsvpSubmittedAt: true,
    },
  });

  res.json({ success: true, data: updated, message: 'RSVP submitted successfully!' });
}

/**
 * Generate a PDF invitation card for a specific guest.
 * GET /invite/:token/pdf
 */
export async function generateInvitePdf(req: Request, res: Response) {
  const token = req.params.token as string;

  const guest = await prisma.guest.findUnique({
    where: { token },
    include: { wedding: true },
  });

  if (!guest) throw ApiError.notFound('Invalid invitation token.');

  const weddingDetails = guest.wedding;

  if (!weddingDetails.isPublished) {
    throw ApiError.notFound('This invitation is not yet available.');
  }

  // Check admin subscription
  const admin = await prisma.admin.findUnique({
    where: { id: weddingDetails.adminId },
    select: { status: true, subscriptionEnd: true },
  });

  if (!admin || admin.status !== 'ACTIVE') {
    throw ApiError.notFound('This invitation link is no longer active.');
  }
  if (admin.subscriptionEnd && admin.subscriptionEnd < new Date()) {
    throw ApiError.notFound('This invitation link is no longer active.');
  }

  const pdfBuffer = await generateInvitationPdf(
    {
      brideName: weddingDetails.brideName,
      groomName: weddingDetails.groomName,
      weddingDate: weddingDetails.weddingDate,
      venueName: weddingDetails.venueName,
      venueAddress: weddingDetails.venueAddress,
      primaryColor: weddingDetails.primaryColor,
      accentColor: weddingDetails.accentColor,
    },
    {
      title: guest.title,
      firstName: guest.firstName,
      lastName: guest.lastName,
    }
  );

  const filename = `invitation-${weddingDetails.brideName}-${weddingDetails.groomName}.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}
