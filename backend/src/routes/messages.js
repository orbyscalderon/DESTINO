import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { messageLimitMiddleware } from '../middleware/messageLimit.js';
import {
  getMessages,
  sendMessage,
  getTodayCount,
  sendImageMessage,
  chatImageMiddleware,
  sendPPVMessage,
  unlockPPV,
  sendVoiceMessage,
  chatAudioMiddleware,
  toggleReaction,
  deleteMessage,
  pinMessage,
  unpinMessage,
  getPinnedMessage,
} from '../controllers/messageController.js';

const router = Router();
router.use(authMiddleware);

router.get('/count/today', getTodayCount);
router.get('/:matchId/pin', getPinnedMessage);
router.get('/:matchId', getMessages);
router.post('/', messageLimitMiddleware, sendMessage);
router.post('/image', chatImageMiddleware, sendImageMessage);
router.post('/voice', chatAudioMiddleware, sendVoiceMessage);
router.post('/:id/reactions', toggleReaction);
router.post('/ppv', chatImageMiddleware, sendPPVMessage);
router.post('/ppv/:messageId/unlock', unlockPPV);
router.delete('/:id', deleteMessage);
router.put('/:matchId/pin', pinMessage);
router.delete('/:matchId/pin', unpinMessage);

export default router;
