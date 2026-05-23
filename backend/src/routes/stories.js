import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listStories, createStory, markStoryViewed, deleteStory, storyUploadMiddleware, getStoryViewers } from '../controllers/storyController.js';

const router = Router();
router.use(authMiddleware);
router.get('/', listStories);
router.post('/', storyUploadMiddleware, createStory);
router.post('/:id/view', markStoryViewed);
router.get('/:id/viewers', getStoryViewers);
router.delete('/:id', deleteStory);
export default router;
