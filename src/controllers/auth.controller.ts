import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { config } from '../config/env';
import { ApiError } from '../utils/ApiError';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

function signToken(id: string, email: string, role: 'SUPER_ADMIN' | 'ADMIN') {
  return jwt.sign({ id, email, role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export async function loginSuperAdmin(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const admin = await prisma.superAdmin.findUnique({ where: { email } });
  if (!admin) throw ApiError.unauthorized('Email not found');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw ApiError.unauthorized('Password incorrect');

  const token = signToken(admin.id, admin.email, 'SUPER_ADMIN');
  res.json({ success: true, token, user: { id: admin.id, email: admin.email, role: 'SUPER_ADMIN' } });
}

export async function loginAdmin(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) throw ApiError.unauthorized('Email not found');

  if (admin.status === 'SUSPENDED') throw ApiError.forbidden('Account suspended. Contact support.');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw ApiError.unauthorized('Password incorrect');

  const token = signToken(admin.id, admin.email, 'ADMIN');
  res.json({
    success: true,
    token,
    user: {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      role: 'ADMIN',
      status: admin.status,
      subscriptionEnd: admin.subscriptionEnd,
    },
  });
}

export async function getAdminMe(req: Request, res: Response) {
  const admin = await prisma.admin.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      displayName: true,
      phone: true,
      status: true,
      subscriptionStart: true,
      subscriptionEnd: true,
      createdAt: true,
    },
  });
  if (!admin) throw ApiError.notFound('Admin not found');
  res.json({ success: true, data: admin });
}

/**
 * Self-service password change for the logged-in user (Admin or SuperAdmin).
 * Requires the current password — this is not the forgot-password flow
 * (that needs email delivery, not built yet; superadmin can force-reset an
 * admin's password in the meantime via POST /superadmin/admins/:id/reset-password).
 */
export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const { id, role } = req.user!;

  const user = role === 'SUPER_ADMIN'
    ? await prisma.superAdmin.findUnique({ where: { id } })
    : await prisma.admin.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound('User not found');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  if (role === 'SUPER_ADMIN') {
    await prisma.superAdmin.update({ where: { id }, data: { passwordHash } });
  } else {
    await prisma.admin.update({ where: { id }, data: { passwordHash } });
  }

  res.json({ success: true, message: 'Password changed successfully' });
}
