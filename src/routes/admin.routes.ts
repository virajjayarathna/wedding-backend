import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validateJwt, requireRole } from '../middleware/auth.middleware';
import { checkSubscription } from '../middleware/subscription.middleware';
import {
  getWedding,
  upsertWedding,
  updateTimeline,
  getUploadUrl,
  deleteGalleryPhoto,
  togglePublish,
} from '../controllers/wedding.controller';
import {
  listGuests,
  createGuest,
  bulkCreateGuests,
  getGuest,
  updateGuest,
  deleteGuest,
  getRsvpSummary,
  getWhatsAppLink,
  regenerateToken,
  downloadCsvTemplate,
} from '../controllers/guest.controller';

const router = Router();

// All admin routes require valid JWT + active subscription
router.use(validateJwt, requireRole('ADMIN'), checkSubscription);

// Wedding Details
router.get('/wedding', asyncHandler(getWedding));
router.put('/wedding', asyncHandler(upsertWedding));
router.patch('/wedding/timeline', asyncHandler(updateTimeline));
router.post('/wedding/upload-url', asyncHandler(getUploadUrl));
router.delete('/wedding/gallery/:key', asyncHandler(deleteGalleryPhoto));
router.patch('/wedding/publish', asyncHandler(togglePublish));

// Guest Management
router.get('/guests', asyncHandler(listGuests));
router.post('/guests', asyncHandler(createGuest));
router.post('/guests/bulk', asyncHandler(bulkCreateGuests));
router.get('/guests/rsvp-summary', asyncHandler(getRsvpSummary));
router.get('/guests/csv-template', asyncHandler(downloadCsvTemplate));
router.get('/guests/:id', asyncHandler(getGuest));
router.patch('/guests/:id', asyncHandler(updateGuest));
router.delete('/guests/:id', asyncHandler(deleteGuest));
router.get('/guests/:id/whatsapp-link', asyncHandler(getWhatsAppLink));
router.post('/guests/:id/regenerate-token', asyncHandler(regenerateToken));

export default router;
