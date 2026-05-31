import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getAchievements, setActiveBadge, getUserAchievements,
} from '../controllers/achievementsController.js';

const router = Router();
router.use(authMiddleware);

router.get('/',                  getAchievements);
router.patch('/badge',           setActiveBadge);
router.get('/user/:userId',      getUserAchievements);

export default router;
