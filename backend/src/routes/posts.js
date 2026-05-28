import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getFeed, getUserPosts, createPost, deletePost, toggleLike, getComments, addComment, purchasePost, postMediaMiddleware, recordView, getByHashtag, getTrendingHashtags } from '../controllers/postController.js';

const router = Router();
router.use(authMiddleware);
router.get('/', getFeed);
router.get('/trending-hashtags', getTrendingHashtags);
router.get('/hashtag/:tag', getByHashtag);
router.get('/user/:userId', getUserPosts);
router.post('/', postMediaMiddleware, createPost);
router.delete('/:id', deletePost);
router.post('/:id/like', toggleLike);
router.post('/:id/view', recordView);
router.post('/:id/purchase', purchasePost);
router.get('/:id/comments', getComments);
router.post('/:id/comments', addComment);
export default router;
