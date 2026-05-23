import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { sendTip, getTipsReceived } from '../controllers/tipController.js';

const router = Router();
router.use(authMiddleware);

router.post('/:userId', sendTip);
router.get('/received', getTipsReceived);

export default router;
