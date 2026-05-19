import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  createCheckout,
  handleWebhook,
  cancelSubscription,
  getSubscriptionStatus,
  createIdentitySession,
} from '../controllers/paymentController.js';

const router = Router();

// El webhook NO necesita authMiddleware — Stripe lo llama directamente
// El raw body se configura en server.js para esta ruta específica
router.post('/webhook', handleWebhook);

router.use(authMiddleware);
router.post('/create-checkout', createCheckout);
router.post('/cancel', cancelSubscription);
router.get('/status', getSubscriptionStatus);
router.post('/identity/create-session', createIdentitySession);

export default router;
