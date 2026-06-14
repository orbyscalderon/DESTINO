import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import {
  getStatus, publish, update, unpublish,
  getModerationRules, getDirectory,
} from '../controllers/fucknowController.js';

const router = Router();

// Rate limit publish/update: 10/min para prevenir spam de moderación
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá un minuto.' },
});

router.get('/status',            authMiddleware, getStatus);
router.get('/directory',         authMiddleware, getDirectory);
router.get('/moderation-rules',  authMiddleware, getModerationRules);
router.post('/publish',          authMiddleware, writeLimiter, publish);
router.post('/update',           authMiddleware, writeLimiter, update);
router.delete('/',               authMiddleware, unpublish);

export default router;
