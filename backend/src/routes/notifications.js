import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getVapidKey, subscribe, unsubscribe, getNotifPrefs, updateNotifPrefs } from '../controllers/notificationController.js';
import { listNotifications, markAllRead, markOneRead } from '../controllers/inAppNotifController.js';

const router = Router();

router.get('/vapid-key', authMiddleware, getVapidKey);
router.post('/subscribe', authMiddleware, subscribe);
router.delete('/unsubscribe', authMiddleware, unsubscribe);

// In-app notifications
router.get('/in-app', authMiddleware, listNotifications);
router.put('/in-app/read-all', authMiddleware, markAllRead);
router.put('/in-app/:id/read', authMiddleware, markOneRead);

router.get('/prefs', authMiddleware, getNotifPrefs);
router.put('/prefs', authMiddleware, updateNotifPrefs);

export default router;
