import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getMyConsents, updateConsent, bulkUpdateConsents, getMyConsentHistory,
} from '../controllers/consentController.js';

const router = Router();
router.use(authMiddleware);

router.get('/',         getMyConsents);
router.get('/history',  getMyConsentHistory);
router.post('/',        updateConsent);
router.post('/bulk',    bulkUpdateConsents);

export default router;
