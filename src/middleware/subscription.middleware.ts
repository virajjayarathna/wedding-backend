import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

/**
 * Checks that the authenticated Admin's subscription is currently active.
 * Must be used AFTER validateJwt + requireRole('ADMIN').
 */
export const checkSubscription = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next();
  }

  const admin = await prisma.admin.findUnique({
    where: { id: req.user.id },
    select: { status: true, subscriptionEnd: true },
  });

  if (!admin) {
    return next(ApiError.unauthorized('Admin account not found'));
  }

  if (admin.status === 'SUSPENDED') {
    return next(ApiError.forbidden('Your account has been suspended. Please contact support.'));
  }

  if (admin.status === 'EXPIRED' || (admin.subscriptionEnd && admin.subscriptionEnd < new Date())) {
    return next(ApiError.forbidden('Your subscription has expired. Please contact support.'));
  }

  next();
};
