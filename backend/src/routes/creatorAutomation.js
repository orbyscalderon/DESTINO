import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import {
  getMyWelcomeMessage, upsertMyWelcomeMessage,
} from '../controllers/welcomeMessageController.js';
import {
  createBroadcast, listMyBroadcasts, getAudienceCount,
} from '../controllers/massDMController.js';

const router = Router();
router.use(authMiddleware);

const broadcastLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Solo puedes enviar 5 mass DM por hora' },
});

router.get('/welcome-message',  getMyWelcomeMessage);
router.put('/welcome-message',  upsertMyWelcomeMessage);

router.get('/mass-dm',                 listMyBroadcasts);
router.get('/mass-dm/audience-count',  getAudienceCount);
router.post('/mass-dm',                broadcastLimiter, createBroadcast);

export default router;
