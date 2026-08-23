import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

// ─── Validation Schemas ────────────────────────────────────────────────────────

const createAdminSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2),
  phone: z.string().optional(),
  temporaryPassword: z.string().min(8),
  ceremonyType: z.enum(['WEDDING', 'HOME_COMING']).optional(),
  subscriptionStart: z.string().datetime({ offset: true }).optional(),
  subscriptionEnd: z.string().datetime({ offset: true }).optional(),
});

const updateAdminSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(2).optional(),
  phone: z.string().optional(),
  ceremonyType: z.enum(['WEDDING', 'HOME_COMING']).optional(),
});

const subscriptionSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED']).optional(),
  subscriptionStart: z.string().datetime({ offset: true }).nullable().optional(),
  subscriptionEnd: z.string().datetime({ offset: true }).nullable().optional(),
});

// ─── Controllers ───────────────────────────────────────────────────────────────

export async function getDashboard(_req: Request, res: Response) {
  const [totalAdmins, activeAdmins, totalGuests] = await Promise.all([
    prisma.admin.count(),
    prisma.admin.count({ where: { status: 'ACTIVE' } }),
    prisma.guest.count(),
  ]);

  const expiredAdmins = await prisma.admin.count({ where: { status: 'EXPIRED' } });
  const suspendedAdmins = await prisma.admin.count({ where: { status: 'SUSPENDED' } });

  res.json({
    success: true,
    data: { totalAdmins, activeAdmins, expiredAdmins, suspendedAdmins, totalGuests },
  });
}

export async function listAdmins(req: Request, res: Response) {
  const page = parseInt(req.query.page as string || '1');
  const limit = parseInt(req.query.limit as string || '20');
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where = {
    ...(status && { status: status as any }),
    ...(search && {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { displayName: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  };

  const [admins, total] = await Promise.all([
    prisma.admin.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        phone: true,
        status: true,
        ceremonyType: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        createdAt: true,
        wedding: { select: { weddingSlug: true, brideName: true, groomName: true, isPublished: true } },
      },
    }),
    prisma.admin.count({ where }),
  ]);

  res.json({ success: true, data: admins, meta: { total, page, limit, pages: Math.ceil(total / limit) } });
}

export async function createAdmin(req: Request, res: Response) {
  const body = createAdminSchema.parse(req.body);

  const existing = await prisma.admin.findUnique({ where: { email: body.email } });
  if (existing) throw ApiError.conflict('An admin with this email already exists');

  const passwordHash = await bcrypt.hash(body.temporaryPassword, 12);

  const admin = await prisma.admin.create({
    data: {
      email: body.email,
      displayName: body.displayName,
      phone: body.phone,
      passwordHash,
      ceremonyType: body.ceremonyType ?? 'WEDDING',
      status: body.subscriptionStart && body.subscriptionEnd ? 'ACTIVE' : 'PENDING',
      subscriptionStart: body.subscriptionStart ? new Date(body.subscriptionStart) : null,
      subscriptionEnd: body.subscriptionEnd ? new Date(body.subscriptionEnd) : null,
    },
    select: { id: true, email: true, displayName: true, status: true, ceremonyType: true, subscriptionEnd: true, createdAt: true },
  });

  res.status(201).json({ success: true, data: admin });
}

export async function getAdmin(req: Request, res: Response) {
  const admin = await prisma.admin.findUnique({
    where: { id: req.params.id as string },
    include: {
      wedding: {
        select: {
          id: true, weddingSlug: true, brideName: true, groomName: true,
          weddingDate: true, isPublished: true,
          _count: { select: { guests: true } },
        },
      },
    },
  });
  if (!admin) throw ApiError.notFound('Admin not found');
  res.json({ success: true, data: admin });
}

export async function updateAdmin(req: Request, res: Response) {
  const body = updateAdminSchema.parse(req.body);

  const admin = await prisma.admin.update({
    where: { id: req.params.id as string },
    data: body,
    select: { id: true, email: true, displayName: true, phone: true, status: true, ceremonyType: true, updatedAt: true },
  });

  res.json({ success: true, data: admin });
}

export async function deleteAdmin(req: Request, res: Response) {
  await prisma.admin.findUniqueOrThrow({ where: { id: req.params.id as string } });
  await prisma.admin.delete({ where: { id: req.params.id as string } });
  res.json({ success: true, message: 'Admin deleted successfully' });
}

export async function updateSubscription(req: Request, res: Response) {
  const body = subscriptionSchema.parse(req.body);

  const admin = await prisma.admin.update({
    where: { id: req.params.id as string },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.subscriptionStart !== undefined && {
        subscriptionStart: body.subscriptionStart ? new Date(body.subscriptionStart) : null,
      }),
      ...(body.subscriptionEnd !== undefined && {
        subscriptionEnd: body.subscriptionEnd ? new Date(body.subscriptionEnd) : null,
      }),
    },
    select: { id: true, email: true, status: true, subscriptionStart: true, subscriptionEnd: true },
  });

  res.json({ success: true, data: admin });
}

export async function resetAdminPassword(req: Request, res: Response) {
  const { newPassword } = z.object({ newPassword: z.string().min(8) }).parse(req.body);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.admin.update({
    where: { id: req.params.id as string },
    data: { passwordHash },
  });

  res.json({ success: true, message: 'Password reset successfully' });
}
