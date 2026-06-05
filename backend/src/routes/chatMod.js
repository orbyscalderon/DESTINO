import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  listMyMods, addMod, removeMod,
  banChatViewer, unbanChatViewer, muteChatViewer,
  listChatRestrictions, amIMod,
} from '../controllers/chatModController.js';

const router = Router();
router.use(authMiddleware);

router.get('/mods', listMyMods);
router.post('/mods', addMod);
router.delete('/mods/:userId', removeMod);

router.get('/am-i-mod/:creatorId', amIMod);
router.post('/chat/ban', banChatViewer);
router.delete('/chat/ban/:creatorId/:viewerId', unbanChatViewer);
router.post('/chat/mute', muteChatViewer);
router.get('/chat/restrictions/:creatorId', listChatRestrictions);

export default router;
