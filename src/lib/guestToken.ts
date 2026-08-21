import { randomBytes } from 'crypto';
import prisma from './prisma';

/**
 * cuid() (the old Prisma default) is timestamp-based and sequentially
 * enumerable — guessing one guest's invite link makes neighboring guests'
 * links guessable too. Use a CSPRNG token instead (192 bits, base64url).
 */
export function generateGuestTokenValue(): string {
  return randomBytes(24).toString('base64url');
}

export async function generateUniqueGuestToken(): Promise<string> {
  for (let attempts = 0; attempts < 10; attempts++) {
    const token = generateGuestTokenValue();
    const existing = await prisma.guest.findUnique({ where: { token }, select: { id: true } });
    if (!existing) return token;
  }
  throw new Error('Failed to generate unique guest token');
}
