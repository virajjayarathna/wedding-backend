import { Request, Response } from 'express';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';

const guestSchema = z.object({
  title: z.enum(['MR', 'MRS', 'MS', 'DR', 'FAMILY', 'MASTER']),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  maxAttendants: z.number().int().min(1).max(20).default(1),
});

const TITLE_LABELS: Record<string, string> = {
  MR: 'Mr.', MRS: 'Mrs.', MS: 'Ms.', DR: 'Dr.', FAMILY: 'Family', MASTER: 'Master',
};

async function getWeddingForAdmin(adminId: string) {
  const wedding = await prisma.weddingDetails.findUnique({ where: { adminId } });
  if (!wedding) throw ApiError.notFound('Wedding details not found. Please set up your wedding page first.');
  return wedding;
}

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

  res.json({ success: true, data: guests });
}

export async function createGuest(req: Request, res: Response) {
  const body = guestSchema.parse(req.body);
  const wedding = await getWeddingForAdmin(req.user!.id);

  const guest = await prisma.guest.create({
    data: { ...body, weddingId: wedding.id },
  });

  res.status(201).json({ success: true, data: guest });
}

export async function bulkCreateGuests(req: Request, res: Response) {
  const body = z.object({
    guests: z.array(guestSchema).min(1).max(500),
  }).parse(req.body);

  const wedding = await getWeddingForAdmin(req.user!.id);

  const guests = await prisma.guest.createMany({
    data: body.guests.map((g) => ({ ...g, weddingId: wedding.id })),
    skipDuplicates: true,
  });

  res.status(201).json({ success: true, data: { created: guests.count } });
}

export async function getGuest(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({
    where: { id: req.params.id, weddingId: wedding.id },
  });
  if (!guest) throw ApiError.notFound('Guest not found');
  res.json({ success: true, data: guest });
}

export async function updateGuest(req: Request, res: Response) {
  const body = guestSchema.partial().parse(req.body);
  const wedding = await getWeddingForAdmin(req.user!.id);

  const guest = await prisma.guest.findFirst({ where: { id: req.params.id, weddingId: wedding.id } });
  if (!guest) throw ApiError.notFound('Guest not found');

  const updated = await prisma.guest.update({ where: { id: req.params.id }, data: body });
  res.json({ success: true, data: updated });
}

export async function deleteGuest(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({ where: { id: req.params.id, weddingId: wedding.id } });
  if (!guest) throw ApiError.notFound('Guest not found');

  await prisma.guest.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Guest deleted' });
}

export async function getRsvpSummary(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);

  const [attending, declining, pending, maybe] = await Promise.all([
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'ATTENDING' } }),
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'DECLINING' } }),
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'PENDING' } }),
    prisma.guest.count({ where: { weddingId: wedding.id, rsvpStatus: 'MAYBE' } }),
  ]);

  const attendingCountResult = await prisma.guest.aggregate({
    where: { weddingId: wedding.id, rsvpStatus: 'ATTENDING' },
    _sum: { attendingCount: true },
  });

  res.json({
    success: true,
    data: {
      attending,
      declining,
      pending,
      maybe,
      totalConfirmedHeadcount: attendingCountResult._sum.attendingCount ?? 0,
    },
  });
}

export async function getWhatsAppLink(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({ where: { id: req.params.id, weddingId: wedding.id } });
  if (!guest) throw ApiError.notFound('Guest not found');

  const weddingDetails = await prisma.weddingDetails.findUnique({ where: { id: wedding.id } });
  if (!weddingDetails) throw ApiError.notFound('Wedding details not found');

  const inviteUrl = `${config.guestInviteBaseUrl}/invite/${guest.token}`;
  const titleLabel = TITLE_LABELS[guest.title] || guest.title;
  const guestName = `${titleLabel} ${guest.firstName} ${guest.lastName}`;
  const weddingDate = weddingDetails.weddingDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const message =
    `Dear ${guestName},\n\n` +
    `You are cordially invited to the wedding of ${weddingDetails.brideName} & ${weddingDetails.groomName} ` +
    `on ${weddingDate}.\n\n` +
    `Please view your personal invitation and kindly RSVP here:\n${inviteUrl}\n\n` +
    `We look forward to celebrating with you! 💍`;

  const phone = guest.phone?.replace(/[^0-9]/g, '') || '';
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  res.json({ success: true, data: { guestName, inviteUrl, whatsappUrl, message } });
}

export async function regenerateToken(req: Request, res: Response) {
  const wedding = await getWeddingForAdmin(req.user!.id);
  const guest = await prisma.guest.findFirst({ where: { id: req.params.id, weddingId: wedding.id } });
  if (!guest) throw ApiError.notFound('Guest not found');

  // Generate a new unique token
  let newToken: string;
  do {
    newToken = createId();
  } while (await prisma.guest.findUnique({ where: { token: newToken } }));

  const updated = await prisma.guest.update({
    where: { id: req.params.id },
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
    'FAMILY,The,Johnsons,+94711234567,4',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="guest-import-template.csv"');
  res.send(csvContent);
}
