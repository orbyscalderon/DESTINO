import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createCheckout,
  handleWebhook,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  getSubscriptionStatus,
  createIdentitySession,
  purchasePhoto,
  confirmPhotoPurchase,
} from '../controllers/paymentController.js';

const router = Router();

router.post('/webhook', handleWebhook);

router.use(authMiddleware);
router.post('/create-checkout', createCheckout);
router.post('/cancel', cancelSubscription);
router.post('/pause', pauseSubscription);
router.post('/resume', resumeSubscription);
router.get('/status', getSubscriptionStatus);
router.post('/identity/create-session', createIdentitySession);
router.post('/photo/:photoId', purchasePhoto);
router.post('/photo/:photoId/confirm', confirmPhotoPurchase);

export default router;
