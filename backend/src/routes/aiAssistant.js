import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { generateIcebreaker } from '../controllers/aiAssistantController.js';

const router = Router();
router.use(authMiddleware);

router.post('/icebreaker', generateIcebreaker);

export default router;
