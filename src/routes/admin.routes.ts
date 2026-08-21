import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler';
import { validateJwt, requireRole } from '../middleware/auth.middleware';
import { checkSubscription } from '../middleware/subscription.middleware';
import {
  getWedding,
  upsertWedding,
  updateTimeline,
  uploadPhoto,
  deleteGalleryPhoto,
  togglePublish,
  deleteMusic,
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
  exportGuestsCsv,
} from '../controllers/guest.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB (supports MP3 audio files)
});

const router = Router();

// All admin routes require valid JWT + active subscription
router.use(validateJwt, requireRole('ADMIN'), checkSubscription);

// Wedding Details
router.get('/wedding', asyncHandler(getWedding));
router.put('/wedding', asyncHandler(upsertWedding));
router.patch('/wedding/timeline', asyncHandler(updateTimeline));
router.post('/wedding/upload', upload.single('file'), asyncHandler(uploadPhoto));
router.delete('/wedding/gallery/:key', asyncHandler(deleteGalleryPhoto));
router.patch('/wedding/publish', asyncHandler(togglePublish));
router.delete('/wedding/music', asyncHandler(deleteMusic));

// Guest Management
router.get('/guests', asyncHandler(listGuests));
router.post('/guests', asyncHandler(createGuest));
router.post('/guests/bulk', asyncHandler(bulkCreateGuests));
router.get('/guests/rsvp-summary', asyncHandler(getRsvpSummary));
router.get('/guests/csv-template', asyncHandler(downloadCsvTemplate));
router.get('/guests/export', asyncHandler(exportGuestsCsv));
router.get('/guests/:id', asyncHandler(getGuest));
router.patch('/guests/:id', asyncHandler(updateGuest));
router.delete('/guests/:id', asyncHandler(deleteGuest));
router.get('/guests/:id/whatsapp-link', asyncHandler(getWhatsAppLink));
router.post('/guests/:id/regenerate-token', asyncHandler(regenerateToken));

export default router;
