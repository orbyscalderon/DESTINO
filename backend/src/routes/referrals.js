import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getMyCode, applyCode } from '../controllers/referralController.js';

const router = Router();
router.use(authMiddleware);

router.get('/code',  getMyCode);
router.post('/apply', applyCode);

export default router;
