import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  listCategories, getCreatorCategories, updateMyCategories, getMyCategories,
} from '../controllers/adultCategoriesController.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listCategories);
router.get('/mine', getMyCategories);
router.put('/mine', updateMyCategories);
router.get('/creator/:userId', getCreatorCategories);

export default router;
