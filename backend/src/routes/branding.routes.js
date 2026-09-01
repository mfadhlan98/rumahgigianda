import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { branding, brandingLogo } from '../controllers/branding.controller.js';

// Publik: dipakai halaman login dan halaman verifikasi yang belum punya sesi.
const router = Router();
router.get('/', wrap(branding));
router.get('/logo', wrap(brandingLogo));

export default router;
