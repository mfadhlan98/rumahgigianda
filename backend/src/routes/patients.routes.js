import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/patients.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/next-mr-no', wrap(c.suggestMrNo));
router.get('/', wrap(c.list));
router.get('/:id', wrap(c.detail));
router.post('/', wrap(c.create));
router.put('/:id', wrap(c.update));
router.patch('/:id/status', requireRole('admin'), wrap(c.deactivate));

export default router;
