import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getEarnings, requestWithdrawal, getMyWithdrawals } from '../controllers/withdrawalController.js';

const router = Router();
router.use(authMiddleware);

router.get('/earnings',  getEarnings);
router.get('/',          getMyWithdrawals);
router.post('/',         requestWithdrawal);

export default router;
