import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { blockUser, unblockUser, getBlockedUsers, reportUser } from '../controllers/blockController.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getBlockedUsers);
router.post('/', blockUser);
router.delete('/:userId', unblockUser);
router.post('/report', reportUser);

export default router;
