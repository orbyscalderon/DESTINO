import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getVapidKey, subscribe, unsubscribe } from '../controllers/notificationController.js';

const router = Router();

router.get('/vapid-key', authMiddleware, getVapidKey);
router.post('/subscribe', authMiddleware, subscribe);
router.delete('/unsubscribe', authMiddleware, unsubscribe);

export default router;
