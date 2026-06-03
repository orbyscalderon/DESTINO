import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  generateSubscribeLink, handleCCBillWebhook,
  setMyCCBillAccount, getMyCCBillAccount,
} from '../controllers/ccbillController.js';

const router = Router();

// El webhook NO usa auth middleware — CCBill lo llama directamente con HMAC.
// Lo registramos en server.js antes del json parser global para preservar el
// body raw (necesario para verificar la firma).
router.post('/webhook', handleCCBillWebhook);

// Endpoints autenticados
router.use(authMiddleware);

router.post('/subscribe-link', generateSubscribeLink);
router.get('/my-account', getMyCCBillAccount);
router.put('/my-account', setMyCCBillAccount);

export default router;
