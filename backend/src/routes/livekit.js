import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getToken } from '../controllers/livekitController.js';

const router = Router();
router.use(authMiddleware);
router.post('/token', getToken);
export default router;
