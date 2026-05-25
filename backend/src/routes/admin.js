import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import {
  getStats, getUsers, getCreators, getShows,
  setUserPremium, setUserTier, setUserVerified, setUserCreator, setUserAdult,
  adjustUserCoins, deleteUser,
  getWithdrawals, processWithdrawal,
  getVerifications, processVerification,
  getContentQueue, processContent,
  endShow, broadcastNotification,
  getReports, processReport,
} from '../controllers/adminController.js';

const router = Router();
router.use(authMiddleware);
router.use(isAdmin);

router.get('/stats',    getStats);
router.get('/users',    getUsers);
router.get('/creators', getCreators);
router.get('/shows',    getShows);

router.patch('/users/premium',  setUserPremium);
router.patch('/users/tier',     setUserTier);
router.patch('/users/verified', setUserVerified);
router.patch('/users/creator',  setUserCreator);
router.patch('/users/adult',    setUserAdult);
router.patch('/users/coins',    adjustUserCoins);

router.delete('/users/:userId', deleteUser);

router.patch('/shows/:id/end',  endShow);
router.post('/notifications/broadcast', broadcastNotification);

router.get('/withdrawals',          getWithdrawals);
router.patch('/withdrawals/:id',    processWithdrawal);
router.get('/verifications',        getVerifications);
router.patch('/verifications/:id',  processVerification);
router.get('/content-queue',        getContentQueue);
router.patch('/content/:postId',    processContent);

router.get('/reports',              getReports);
router.patch('/reports/:id',        processReport);

export default router;
