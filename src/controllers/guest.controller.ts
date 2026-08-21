import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';
import { parseCsv } from '../utils/csvParser';
import { generateGuestTokenValue, generateUniqueGuestToken } from '../lib/guestToken';

// ─── Validation Schemas ────────────────────────────────────────────────────────

const VALID_TITLES = ['MR', 'MRS', 'MR_AND_MRS', 'MS', 'DR', 'FAMILY', 'MASTER'] as const;

const guestSchema = z.object({
  title: z.enum(VALID_TITLES),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  maxAttendants: z.number().int().min(1).max(20).default(1),
  // Optional references into WeddingDetails.rsvpContacts — neither is mandatory
  firstRsvpContactId: z.string().min(1).optional().nullable(),
  secondRsvpContactId: z.string().min(1).optional().nullable(),
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
  MR: 'Mr.', MRS: 'Mrs.', MS: 'Ms.', DR: 'Dr.', FAMILY: 'Family', MASTER: 'Master',
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
    data: { ...body, weddingId: wedding.id, token: generateGuestTokenValue() },
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

  // Validate all titles
  const invalidTitles = guestsData
    .filter((g) => !VALID_TITLES.includes(g.title))
    .map((g) => g.title);
  if (invalidTitles.length > 0) {
    throw ApiError.badRequest(
      `Invalid titles: ${[...new Set(invalidTitles)].join(', ')}. Valid: ${VALID_TITLES.join(', ')}`
    );
  }

  const result = await prisma.guest.createMany({
    data: guestsData.map((g) => ({ ...g, weddingId: wedding.id, token: generateGuestTokenValue() })),
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

  const updated = await prisma.guest.update({ where: { id: req.params.id as string }, data: body });
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

  const inviteUrl = `${config.guestInviteBaseUrl}/invite/${guest.token}`;
  const titleLabel = TITLE_LABELS[guest.title] || guest.title;
  const guestName = `${titleLabel} ${guest.firstName} ${guest.lastName}`;
  const weddingDate = weddingDetails.weddingDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message =
    `Dear ${guestName},\n\n` +
    `You are cordially invited to the wedding of ${weddingDetails.brideName} & ${weddingDetails.groomName} ` +
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

  const newToken = await generateUniqueGuestToken();

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

/**
 * Quote a CSV field if it contains a comma, quote, or newline; double up
 * any internal quotes. Free-text fields (dietaryNotes, notes) can contain
 * any of those, so the plain join() the import template uses isn't safe here.
 */
function csvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export async function exportGuestsCsv(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);

  const guests = await prisma.guest.findMany({
    where: { weddingId: wedding.id },
    orderBy: { createdAt: 'desc' },
  });

  const header = [
    'title', 'firstName', 'lastName', 'phone', 'maxAttendants',
    'rsvpStatus', 'attendingCount', 'dietaryNotes', 'notes', 'rsvpSubmittedAt',
  ];
  const rows = guests.map((g) => [
    csvField(g.title),
    csvField(g.firstName),
    csvField(g.lastName),
    csvField(g.phone),
    csvField(g.maxAttendants),
    csvField(g.rsvpStatus),
    csvField(g.attendingCount),
    csvField(g.dietaryNotes),
    csvField(g.notes),
    csvField(g.rsvpSubmittedAt ? g.rsvpSubmittedAt.toISOString() : ''),
  ].join(','));

  const csvContent = [header.join(','), ...rows].join('\n');
  const filename = `guest-list-${wedding.weddingSlug}.csv`.replace(/[^a-z0-9.-]/gi, '-');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
}
