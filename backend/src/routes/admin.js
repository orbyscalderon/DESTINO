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
  getPlatformRevenue,
} from '../controllers/adminController.js';
import { listDMCA, processDMCA } from '../controllers/dmcaController.js';
import { listTicketsAdmin, respondTicketAdmin } from '../controllers/supportController.js';
import {
  globalSearch, revenueDaily, getAuditLog, exportDataset,
  getUsersFiltered, bulkUserAction, getFunnel,
} from '../controllers/adminExtraController.js';

const router = Router();
router.use(authMiddleware);
router.use(isAdmin);

router.get('/stats',    getStats);
router.get('/platform-revenue', getPlatformRevenue);
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

router.get('/dmca',                 listDMCA);
router.patch('/dmca/:id',           processDMCA);

router.get('/support',              listTicketsAdmin);
router.patch('/support/:id',        respondTicketAdmin);

// Búsqueda global, revenue diario, audit log, export CSV, filtros y bulk
router.get('/search',           globalSearch);
router.get('/revenue-daily',    revenueDaily);
router.get('/audit-log',        getAuditLog);
router.get('/export/:dataset',  exportDataset);
router.get('/users-filtered',   getUsersFiltered);
router.post('/users/bulk',      bulkUserAction);
router.get('/funnel',           getFunnel);

export default router;
