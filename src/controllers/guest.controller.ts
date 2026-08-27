import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';
import { parseCsv } from '../utils/csvParser';

// ─── Validation Schemas ────────────────────────────────────────────────────────

const guestSchema = z.object({
  title: z.string().min(1).max(50),
  isFamily: z.boolean().optional().default(false),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  maxAttendants: z.number().int().min(1).max(20).default(1),
  sent: z.boolean().optional().default(false),
  // Optional references into WeddingDetails.rsvpContacts — neither is mandatory
  firstRsvpContactId: z.string().min(1).optional().nullable(),
  secondRsvpContactId: z.string().min(1).optional().nullable(),
  // Manual RSVP override — only meaningful on updateGuest (createGuest ignores
  // these since a freshly created guest is always PENDING).
  rsvpStatus: z.enum(['PENDING', 'ATTENDING', 'DECLINING', 'MAYBE']).optional(),
  attendingCount: z.number().int().min(1).optional(),
  dietaryNotes: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

/**
 * Ensure the chosen RSVP contact id(s) are distinct and actually exist in the
 * wedding's configured rsvpContacts list (set in the admin "Venue & RSVP" tab).
 */
function validateRsvpContactSelection(
  wedding: { rsvpContacts: unknown },
  firstId: string | null | undefined,
  secondId: string | null | undefined
) {
  if (firstId && secondId && firstId === secondId) {
    throw ApiError.badRequest('First and Second RSVP contact must be different.');
  }
  if (!firstId && !secondId) return;
  const contacts = Array.isArray(wedding.rsvpContacts) ? (wedding.rsvpContacts as Array<{ id: string }>) : [];
  const ids = new Set(contacts.map((c) => c.id));
  if (firstId && !ids.has(firstId)) throw ApiError.badRequest('Invalid First RSVP contact selected.');
  if (secondId && !ids.has(secondId)) throw ApiError.badRequest('Invalid Second RSVP contact selected.');
}

const TITLE_LABELS: Record<string, string> = {
  MR: 'Mr.', MRS: 'Mrs.', MR_AND_MRS: 'Mr. & Mrs.', MS: 'Ms.', DR: 'Dr.', FAMILY: 'Family', MASTER: 'Master',
  BRIG: 'Brig.', BRIG_AND_MRS: 'Brig. and Mrs.', MAJ: 'Maj.',
};

// ─── Helper ────────────────────────────────────────────────────────────────────

async function getWeddingForAdmin(adminId: string) {
  const wedding = await prisma.weddingDetails.findUnique({ where: { adminId } });
  if (!wedding) {
    throw ApiError.notFound(
      'Wedding details not found. Please set up your wedding page first.'
    );
  }
  return wedding;
}

// ─── Controllers ───────────────────────────────────────────────────────────────

export async function listGuests(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const { rsvpStatus, search } = req.query;

  const guests = await prisma.guest.findMany({
    where: {
      weddingId: wedding.id,
      ...(rsvpStatus && { rsvpStatus: rsvpStatus as any }),
      ...(search && {
        OR: [
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string } },
        ],
      }),
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: guests, total: guests.length });
}

export async function createGuest(req: Request, res: Response) {
  const body = guestSchema.parse(req.body);
  const wedding = await getWeddingForAdmin(req.user!.id);
  validateRsvpContactSelection(wedding, body.firstRsvpContactId, body.secondRsvpContactId);

  const guest = await prisma.guest.create({
    data: { ...body, weddingId: wedding.id },
  });

  res.status(201).json({ success: true, data: guest });
}

/**
 * Bulk import guests via JSON array OR raw CSV text.
 * Body: { guests: [...] }  OR  { csv: "title,firstName,lastName\n..." }
 */
export async function bulkCreateGuests(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);

  let guestsData: Array<{
    title: any;
    firstName: string;
    lastName: string;
    phone?: string;
    maxAttendants: number;
  }>;

  // CSV text import
  if (req.body.csv) {
    const rows = parseCsv(req.body.csv as string);
    if (rows.length === 0) throw ApiError.badRequest('No valid rows found in CSV.');
    if (rows.length > 500) throw ApiError.badRequest('Maximum 500 guests per bulk import.');

    guestsData = rows.map((r) => ({
      title: r.title as any,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      maxAttendants: r.maxAttendants ?? 1,
    }));
  } else {
    // JSON array import
    const body = z
      .object({ guests: z.array(guestSchema).min(1).max(500) })
      .parse(req.body);
    guestsData = body.guests;
  }

  const missingTitles = guestsData.filter((g) => !g.title || !String(g.title).trim());
  if (missingTitles.length > 0) {
    throw ApiError.badRequest('Every guest row must have a title.');
  }

  const result = await prisma.guest.createMany({
    data: guestsData.map((g) => ({ ...g, weddingId: wedding.id })),
    skipDuplicates: false,
  });

  res.status(201).json({ success: true, data: { created: result.count } });
}

export async function getGuest(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({
    where: { id: req.params.id as string, weddingId: wedding.id },
  });
  if (!guest) throw ApiError.notFound('Guest not found');
  res.json({ success: true, data: guest });
}

export async function updateGuest(req: Request, res: Response) {
  const body = guestSchema.partial().parse(req.body);
  const wedding = await getWeddingForAdmin(req.user!.id);

  const guest = await prisma.guest.findFirst({
    where: { id: req.params.id as string, weddingId: wedding.id },
  });
  if (!guest) throw ApiError.notFound('Guest not found');

  const nextFirstId = 'firstRsvpContactId' in body ? body.firstRsvpContactId : guest.firstRsvpContactId;
  const nextSecondId = 'secondRsvpContactId' in body ? body.secondRsvpContactId : guest.secondRsvpContactId;
  validateRsvpContactSelection(wedding, nextFirstId, nextSecondId);

  const data: Record<string, unknown> = { ...body };

  // Admin manually setting/changing the RSVP status — stamp who did it, same as
  // the guest-facing submitRsvp does for their own submissions. Whichever side
  // writes last wins; there's no locking, so a guest visiting their invite link
  // after an admin edit will still overwrite it via submitRsvp as normal.
  if (body.rsvpStatus) {
    const nextMaxAttendants = 'maxAttendants' in body && body.maxAttendants !== undefined
      ? body.maxAttendants
      : guest.maxAttendants;
    if (body.rsvpStatus === 'ATTENDING') {
      const count = body.attendingCount ?? guest.attendingCount ?? 1;
      if (count > nextMaxAttendants) {
        throw ApiError.badRequest(
          `Maximum allowed attendants is ${nextMaxAttendants}. You entered ${count}.`
        );
      }
      data.attendingCount = count;
    } else {
      data.attendingCount = null;
    }
    data.rsvpUpdatedBy = 'ADMIN';
    data.rsvpSubmittedAt = new Date();
  }

  const updated = await prisma.guest.update({ where: { id: req.params.id as string }, data });
  res.json({ success: true, data: updated });
}

export async function deleteGuest(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({
    where: { id: req.params.id as string, weddingId: wedding.id },
  });
  if (!guest) throw ApiError.notFound('Guest not found');

  await prisma.guest.delete({ where: { id: req.params.id as string } });
  res.json({ success: true, message: 'Guest deleted' });
}

export async function getRsvpSummary(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);

  const [attending, declining, pending, maybe, headcountResult] = await Promise.all([
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'ATTENDING' } }),
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'DECLINING' } }),
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'PENDING' } }),
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'MAYBE' } }),
    prisma.guest.aggregate({
      where: { weddingId: wedding.id, rsvpStatus: 'ATTENDING' },
      _sum: { attendingCount: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      attending,
      declining,
      pending,
      maybe,
      totalGuests: attending + declining + pending + maybe,
      totalConfirmedHeadcount: headcountResult._sum.attendingCount ?? 0,
    },
  });
}

export async function getWhatsAppLink(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({
    where: { id: req.params.id as string, weddingId: wedding.id },
  });
  if (!guest) throw ApiError.notFound('Guest not found');

  const weddingDetails = await prisma.weddingDetails.findUnique({
    where: { id: wedding.id },
  });
  if (!weddingDetails) throw ApiError.notFound('Wedding details not found');

  const admin = await prisma.admin.findUnique({
    where: { id: wedding.adminId },
    select: { ceremonyType: true },
  });
  const isHomeComing = admin?.ceremonyType === 'HOME_COMING';
  const coupleNames = isHomeComing
    ? `${weddingDetails.groomName} & ${weddingDetails.brideName}`
    : `${weddingDetails.brideName} & ${weddingDetails.groomName}`;

  const inviteUrl = `${config.guestInviteBaseUrl}/invite/${guest.token}`;
  const titleLabel = TITLE_LABELS[guest.title] || guest.title;
  const guestName = guest.isFamily
    ? `${titleLabel} ${guest.firstName} ${guest.lastName} and Family`
    : `${titleLabel} ${guest.firstName} ${guest.lastName}`;
  const weddingDate = weddingDetails.weddingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message =
    `Dear ${guestName},\n\n` +
    `You are cordially invited to the ${isHomeComing ? 'homecoming' : 'wedding'} of ${coupleNames} ` +
    `on ${weddingDate}.\n\n` +
    `Please view your personal invitation and kindly RSVP here:\n${inviteUrl}\n\n` +
    `We look forward to celebrating with you! 💍`;

  // Strip non-numeric chars, keep + prefix
  const phone = guest.phone?.replace(/[^0-9+]/g, '').replace(/^\+/, '') || '';
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  res.json({
    success: true,
    data: {
      guestName,
      inviteUrl,
      whatsappUrl,
      message,
      hasPhone: !!phone,
    },
  });
}

export async function regenerateToken(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({
    where: { id: req.params.id as string, weddingId: wedding.id },
  });
  if (!guest) throw ApiError.notFound('Guest not found');

  // Generate a new unique token
  let newToken: string;
  let attempts = 0;
  do {
    newToken = randomUUID();
    attempts++;
    if (attempts > 10) throw ApiError.internal('Failed to generate unique token');
  } while (await prisma.guest.findUnique({ where: { token: newToken } }));

  const updated = await prisma.guest.update({
    where: { id: req.params.id as string },
    data: { token: newToken },
    select: { id: true, token: true },
  });

  res.json({ success: true, data: updated });
}

export async function downloadCsvTemplate(_req: Request, res: Response) {
  const csvContent = [
    'title,firstName,lastName,phone,maxAttendants',
    'MR,John,Smith,+94771234567,2',
    'MRS,Jane,Doe,+94777654321,1',
    'MS,Sarah,Johnson,+94711234567,1',
    'FAMILY,The,Johnsons,+94722345678,4',
    'DR,Alan,Brown,,1',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="guest-import-template.csv"');
  res.send(csvContent);
}
