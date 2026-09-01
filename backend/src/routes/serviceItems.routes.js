import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/serviceItems.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/', wrap(c.list));
router.post('/', requireRole('admin'), wrap(c.create));
router.put('/:id', requireRole('admin'), wrap(c.update));
router.patch('/:id/status', requireRole('admin'), wrap(c.setStatus));

export default router;
