import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveInvite, submitRsvp } from '../controllers/invite.controller';

const router = Router();

// Strict rate limit on RSVP submissions — 10 per 15 min per IP
const rsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many RSVP attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes — no auth required, only valid guest token
router.get('/:token', asyncHandler(resolveInvite));
router.post('/:token/rsvp', rsvpLimiter, asyncHandler(submitRsvp));

export default router;
