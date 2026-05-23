import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getStats, getUsers, getCreators, getShows,
  setUserPremium, setUserVerified, setUserCreator, setUserAdult,
  deleteUser,
  getWithdrawals, processWithdrawal,
  getVerifications, processVerification,
  getContentQueue, processContent,
} from '../controllers/adminController.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats',    getStats);
router.get('/users',    getUsers);
router.get('/creators', getCreators);
router.get('/shows',    getShows);

router.patch('/users/premium',  setUserPremium);
router.patch('/users/verified', setUserVerified);
router.patch('/users/creator',  setUserCreator);
router.patch('/users/adult',    setUserAdult);

router.delete('/users/:userId', deleteUser);

router.get('/withdrawals',          getWithdrawals);
router.patch('/withdrawals/:id',    processWithdrawal);
router.get('/verifications',        getVerifications);
router.patch('/verifications/:id',  processVerification);
router.get('/content-queue',        getContentQueue);
router.patch('/content/:postId',    processContent);

export default router;
