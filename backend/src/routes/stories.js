import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listStories, createStory, markStoryViewed, deleteStory, storyUploadMiddleware, getStoryViewers, replyToStory } from '../controllers/storyController.js';

const router = Router();
router.use(authMiddleware);
router.get('/', listStories);
router.post('/', storyUploadMiddleware, createStory);
router.post('/:id/view', markStoryViewed);
router.post('/:id/reply', replyToStory);
router.get('/:id/viewers', getStoryViewers);
router.delete('/:id', deleteStory);
export default router;
