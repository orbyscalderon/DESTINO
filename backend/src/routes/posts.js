import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getFeed, getUserPosts, createPost, deletePost, toggleLike, getComments, addComment, postMediaMiddleware } from '../controllers/postController.js';

const router = Router();
router.use(authMiddleware);
router.get('/', getFeed);
router.get('/user/:userId', getUserPosts);
router.post('/', postMediaMiddleware, createPost);
router.delete('/:id', deletePost);
router.post('/:id/like', toggleLike);
router.get('/:id/comments', getComments);
router.post('/:id/comments', addComment);
export default router;
