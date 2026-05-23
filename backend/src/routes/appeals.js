import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { submitAppeal, getUserAppeals } from '../controllers/appealsController.js';
import { adminListAppeals, adminReviewAppeal } from '../controllers/appealsController.js';
import { isAdmin } from '../middleware/admin.js';

const router = Router();
router.use(authMiddleware);

router.post('/',    submitAppeal);
router.get('/',     getUserAppeals);

// Admin
router.get('/admin',        isAdmin, adminListAppeals);
router.patch('/admin/:id',  isAdmin, adminReviewAppeal);

export default router;
