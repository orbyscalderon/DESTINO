import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  uploadReel, reelUploadMiddleware,
  getReelsFeed, getUserReels, getReel,
  toggleLikeReel, trackReelView, deleteReel,
} from '../controllers/reelsController.js';

const router = Router();

router.use(authMiddleware);

// Feed personalizado "For You"
router.get('/feed', getReelsFeed);

// Reels de un usuario específico
router.get('/user/:userId', getUserReels);

// Upload
router.post('/', reelUploadMiddleware, uploadReel);

// Reel individual
router.get('/:id', getReel);
router.delete('/:id', deleteReel);

// Acciones
router.post('/:id/like', toggleLikeReel);
router.post('/:id/view', trackReelView);

export default router;
