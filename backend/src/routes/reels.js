import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  uploadReel, reelUploadMiddleware,
  getReelsFeed, getUserReels, getReel,
  toggleLikeReel, trackReelView, deleteReel,
  getReelComments, addReelComment, deleteReelComment,
} from '../controllers/reelsController.js';

const router = Router();

router.use(authMiddleware);

// Feed personalizado "For You"
router.get('/feed', getReelsFeed);

// Reels de un usuario específico
router.get('/user/:userId', getUserReels);

// Upload
router.post('/', reelUploadMiddleware, uploadReel);

// Comments (montar antes de /:id para evitar conflictos)
router.get('/:id/comments', getReelComments);
router.post('/:id/comments', addReelComment);
router.delete('/:reelId/comments/:commentId', deleteReelComment);

// Acciones
router.post('/:id/like', toggleLikeReel);
router.post('/:id/view', trackReelView);

// Reel individual (wildcard al final)
router.get('/:id', getReel);
router.delete('/:id', deleteReel);

export default router;
