import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { verify } from '../controllers/verify.controller.js';

// Publik: dipakai saat pasien/auditor memindai QR pada kwitansi.
const router = Router();
router.get('/', wrap(verify));

export default router;
