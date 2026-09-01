import { Router } from 'express';
import { wrap } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as c from '../controllers/reports.controller.js';

const router = Router();
router.use(requireAuth);

router.get('/summary', wrap(c.summary));
router.get('/export.csv', wrap(c.exportCsv));

export default router;
