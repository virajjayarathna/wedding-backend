import { ApiError } from '../utils/ApiError';

/**
 * Days past the wedding date that guest invite links keep working even if the
 * admin's subscription has lapsed. Without this, a subscription ending days
 * before the wedding kills every guest's link with zero warning — see
 * ROADMAP_PROGRESS.md P0-1.
 */
export const INVITE_GRACE_DAYS = 30;

export function inviteGraceDeadline(weddingDate: Date): Date {
  const deadline = new Date(weddingDate);
  deadline.setDate(deadline.getDate() + INVITE_GRACE_DAYS);
  return deadline;
}

/**
 * Throws if a guest-facing invite (view, RSVP, PDF) should not be served for
 * this admin. Suspended/pending admins are blocked outright — that's not a
 * subscription lapse. A lapsed subscription (EXPIRED status or subscriptionEnd
 * in the past) only blocks once the grace window past the wedding date has
 * also elapsed, and returns 410 so the client can show a "link paused,
 * contact the couple" page instead of a generic invalid-link 404.
 */
export function assertInviteAccessible(
  admin: { status: string; subscriptionEnd: Date | null },
  weddingDate: Date
): void {
  if (admin.status === 'SUSPENDED') {
    throw ApiError.notFound('This invitation link is no longer active.');
  }
  if (admin.status === 'PENDING') {
    throw ApiError.notFound('This invitation is not yet available.');
  }

  const lapsed = admin.status === 'EXPIRED' || (!!admin.subscriptionEnd && admin.subscriptionEnd < new Date());
  if (lapsed && new Date() > inviteGraceDeadline(weddingDate)) {
    throw ApiError.gone('This invitation link has been paused. Please contact the couple directly.');
  }
}
