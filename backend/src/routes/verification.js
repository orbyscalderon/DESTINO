import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getStatus, startVerification, checkVerification } from '../controllers/verificationController.js';

const router = Router();
router.use(authMiddleware);

router.get('/status',  getStatus);
router.post('/start',  startVerification);
router.post('/check',  checkVerification);

export default router;
