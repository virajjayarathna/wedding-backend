import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import {
  loginSuperAdmin,
  loginAdmin,
  getAdminMe,
} from '../controllers/auth.controller';
import { validateJwt, requireRole } from '../middleware/auth.middleware';

const router = Router();

// POST /v1/auth/superadmin/login
router.post('/superadmin/login', asyncHandler(loginSuperAdmin));

// POST /v1/auth/admin/login
router.post('/admin/login', asyncHandler(loginAdmin));

// GET /v1/auth/admin/me
router.get('/admin/me', validateJwt, requireRole('ADMIN'), asyncHandler(getAdminMe));

export default router;
