import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { login, me, changePassword } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', wrap(login));
router.get('/me', requireAuth, wrap(me));
router.post('/change-password', requireAuth, wrap(changePassword));

export default router;
