import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getBalance, getPackages, purchaseCoins, confirmCoinPurchase, getTransactions } from '../controllers/coinController.js';

const router = Router();
router.use(authMiddleware);
router.get('/balance', getBalance);
router.get('/packages', getPackages);
router.post('/purchase', purchaseCoins);
router.post('/purchase/confirm', confirmCoinPurchase);
router.get('/transactions', getTransactions);
export default router;
