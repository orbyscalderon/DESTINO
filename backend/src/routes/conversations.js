import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  listMyConversations, createConversation, getConversation,
  addMember, removeMember, markRead,
} from '../controllers/conversationController.js';

const router = Router();
router.use(authMiddleware);

router.get('/', listMyConversations);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.post('/:id/members', addMember);
router.delete('/:id/members/:userId', removeMember);
router.post('/:id/read', markRead);

export default router;
