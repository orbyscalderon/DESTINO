import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { premiumMiddleware } from '../middleware/premium.js';
import {
  likeProfile,
  dislikeProfile,
  getMatches,
  getMatch,
  getWhoLikedMe,
  getSentLikes,
  getLikesCount,
  addBonusLikes,
  undoLastSwipe,
} from '../controllers/matchController.js';

const router = Router();

router.use(authMiddleware);

router.post('/like', likeProfile);
router.post('/dislike', dislikeProfile);
router.post('/undo', premiumMiddleware, undoLastSwipe);
router.post('/likes/add', addBonusLikes);
router.get('/likes/count', getLikesCount);
router.get('/', getMatches);
router.get('/likes', premiumMiddleware, getWhoLikedMe); // Solo premium — debe ir antes de /:matchId
router.get('/sent', getSentLikes);
router.get('/:matchId', getMatch);

export default router;
