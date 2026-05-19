import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { premiumMiddleware } from '../middleware/premium.js';
import {
  likeProfile,
  dislikeProfile,
  getMatches,
  getWhoLikedMe,
  getLikesCount,
  addBonusLikes,
} from '../controllers/matchController.js';

const router = Router();

router.use(authMiddleware);

router.post('/like', likeProfile);
router.post('/dislike', dislikeProfile);
router.post('/likes/add', addBonusLikes);
router.get('/likes/count', getLikesCount);
router.get('/', getMatches);
router.get('/likes', premiumMiddleware, getWhoLikedMe); // Solo premium

export default router;
