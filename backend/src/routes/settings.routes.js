import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/settings.controller.js';

const router = Router();
router.use(requireAuth);

// Semua staf boleh membaca profil klinik (dipakai untuk pratinjau cetak).
router.get('/', wrap(c.read));
router.get('/logo', wrap(c.getLogo));

// Perubahan profil & logo hanya untuk admin.
router.put('/', requireRole('admin'), wrap(c.save));
router.post('/logo', requireRole('admin'), wrap(c.uploadLogo));
router.delete('/logo', requireRole('admin'), wrap(c.removeLogo));

export default router;
