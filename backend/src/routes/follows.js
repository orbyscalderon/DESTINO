import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { followUser, unfollowUser, getFollowStatus, getFollowers } from '../controllers/followController.js';

const router = Router();
router.use(authMiddleware);

router.post('/:userId',           followUser);
router.delete('/:userId',         unfollowUser);
router.get('/:userId/status',     getFollowStatus);
router.get('/:userId/followers',  getFollowers);

export default router;
