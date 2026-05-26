import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { resolveInvite, submitRsvp } from '../controllers/invite.controller';

const router = Router();

// Public routes — no auth required, only valid guest token
router.get('/:token', asyncHandler(resolveInvite));
router.post('/:token/rsvp', asyncHandler(submitRsvp));

export default router;
