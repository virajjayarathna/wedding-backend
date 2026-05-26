import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { validateJwt, requireRole } from '../middleware/auth.middleware';
import {
  getDashboard,
  listAdmins,
  createAdmin,
  getAdmin,
  updateAdmin,
  deleteAdmin,
  updateSubscription,
  resetAdminPassword,
} from '../controllers/superadmin.controller';

const router = Router();

// All routes require Super Admin JWT
router.use(validateJwt, requireRole('SUPER_ADMIN'));

router.get('/dashboard', asyncHandler(getDashboard));
router.get('/admins', asyncHandler(listAdmins));
router.post('/admins', asyncHandler(createAdmin));
router.get('/admins/:id', asyncHandler(getAdmin));
router.patch('/admins/:id', asyncHandler(updateAdmin));
router.delete('/admins/:id', asyncHandler(deleteAdmin));
router.patch('/admins/:id/subscription', asyncHandler(updateSubscription));
router.post('/admins/:id/reset-password', asyncHandler(resetAdminPassword));

export default router;
