import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getEarnings, requestWithdrawal, getMyWithdrawals,
  getAutoPayoutSettings, updateAutoPayoutSettings,
} from '../controllers/withdrawalController.js';

const router = Router();
router.use(authMiddleware);

router.get('/earnings',       getEarnings);
router.get('/auto-payout',    getAutoPayoutSettings);
router.patch('/auto-payout',  updateAutoPayoutSettings);
router.get('/',               getMyWithdrawals);
router.post('/',              requestWithdrawal);

export default router;
