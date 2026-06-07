import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  muteUser, unmuteUser, listMyMutes, checkMute,
} from '../controllers/userMuteController.js';

const router = Router();
router.use(authMiddleware);

router.get('/', listMyMutes);
router.get('/check/:userId', checkMute);
router.post('/', muteUser);
router.delete('/:userId', unmuteUser);

export default router;
