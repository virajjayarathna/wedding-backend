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

function signToken(id: string, email: string, role: 'SUPER_ADMIN' | 'ADMIN') {
  return jwt.sign({ id, email, role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

export async function loginSuperAdmin(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const admin = await prisma.superAdmin.findUnique({ where: { email } });
  if (!admin) throw ApiError.unauthorized('Invalid credentials');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw ApiError.unauthorized('Invalid credentials');

  const token = signToken(admin.id, admin.email, 'SUPER_ADMIN');
  res.json({ success: true, token, user: { id: admin.id, email: admin.email, role: 'SUPER_ADMIN' } });
}

export async function loginAdmin(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) throw ApiError.unauthorized('Invalid credentials');

  if (admin.status === 'SUSPENDED') throw ApiError.forbidden('Account suspended. Contact support.');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) throw ApiError.unauthorized('Invalid credentials');

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
