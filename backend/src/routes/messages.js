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
  sendVideoMessage,
  chatVideoMiddleware,
  toggleReaction,
  deleteMessage,
  clearConversation,
  pinMessage,
  unpinMessage,
  getPinnedMessage,
  setDisappearing,
  cancelScheduled,
  listScheduled,
} from '../controllers/messageController.js';

const router = Router();
router.use(authMiddleware);

router.get('/count/today', getTodayCount);
router.get('/scheduled',   listScheduled);
router.get('/:matchId/pin', getPinnedMessage);
router.get('/:matchId', getMessages);
router.post('/', messageLimitMiddleware, sendMessage);
router.post('/image', chatImageMiddleware, sendImageMessage);
router.post('/voice', chatAudioMiddleware, sendVoiceMessage);
router.post('/video', chatVideoMiddleware, sendVideoMessage);
router.post('/:id/reactions', toggleReaction);
router.post('/ppv', chatImageMiddleware, sendPPVMessage);
router.post('/ppv/:messageId/unlock', unlockPPV);
router.delete('/:matchId/all', clearConversation);
router.delete('/scheduled/:id', cancelScheduled);
router.delete('/:id', deleteMessage);
router.put('/:matchId/pin', pinMessage);
router.delete('/:matchId/pin', unpinMessage);
router.patch('/:matchId/disappear', setDisappearing);

export default router;
