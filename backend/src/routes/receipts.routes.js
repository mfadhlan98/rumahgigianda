import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/receipts.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', wrap(c.list));
router.get('/:id', wrap(c.detail));
router.get('/:id/pdf', wrap(c.pdf));
router.post('/', wrap(c.create));
router.post('/:id/void', requireRole('admin'), wrap(c.voidReceipt));

export default router;
