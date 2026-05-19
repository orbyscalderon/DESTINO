import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { translate } from '../controllers/translationController.js';

const router = Router();

router.post('/', authMiddleware, translate);

export default router;
