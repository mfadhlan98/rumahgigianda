import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/users.controller.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', wrap(c.list));
router.post('/', wrap(c.create));
router.put('/:id', wrap(c.update));
router.post('/:id/reset-password', wrap(c.resetPassword));
router.get('/audit/logs', wrap(c.auditLogs));

export default router;
