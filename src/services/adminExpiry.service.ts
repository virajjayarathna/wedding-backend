import prisma from '../lib/prisma';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Moves ACTIVE admins whose subscriptionEnd has passed into EXPIRED. Nothing
 * else did this before — the superadmin dashboard's EXPIRED count read 0
 * forever while every actual expiry check happened ad-hoc against
 * subscriptionEnd at request time (see ROADMAP_PROGRESS.md P0-2).
 */
export async function expireLapsedAdmins(): Promise<number> {
  const result = await prisma.admin.updateMany({
    where: { status: 'ACTIVE', subscriptionEnd: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  if (result.count > 0) {
    console.log(`[adminExpiry] moved ${result.count} lapsed admin(s) to EXPIRED`);
  }
  return result.count;
}

export function startAdminExpiryJob(): void {
  expireLapsedAdmins().catch((err) => console.error('[adminExpiry] initial run failed', err));
  setInterval(() => {
    expireLapsedAdmins().catch((err) => console.error('[adminExpiry] run failed', err));
  }, CHECK_INTERVAL_MS);
}
