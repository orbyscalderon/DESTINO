import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { messageLimitMiddleware } from '../middleware/messageLimit.js';
import {
  getMessages,
  sendMessage,
  getTodayCount,
  sendImageMessage,
  chatImageMiddleware,
} from '../controllers/messageController.js';

const router = Router();

router.use(authMiddleware);

router.get('/count/today', getTodayCount);
router.get('/:matchId', getMessages);
router.post('/', messageLimitMiddleware, sendMessage);
router.post('/image', chatImageMiddleware, messageLimitMiddleware, sendImageMessage);

export default router;
