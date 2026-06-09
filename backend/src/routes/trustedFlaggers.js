import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import {
  submitTrustedFlag, listFlagReports, processFlagReport,
  listFlaggers, createFlagger, toggleFlaggerActive,
} from '../controllers/trustedFlaggerController.js';

const router = Router();

// Endpoint público (con autenticación por X-Flagger-Key)
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: { error: 'Rate limit excedido para este flagger' },
});
router.post('/report', submitLimiter, submitTrustedFlag);

// Admin endpoints
router.use('/admin', authMiddleware, isAdmin);
router.get('/admin/reports',       listFlagReports);
router.patch('/admin/reports/:id', processFlagReport);
router.get('/admin/flaggers',      listFlaggers);
router.post('/admin/flaggers',     createFlagger);
router.patch('/admin/flaggers/:id', toggleFlaggerActive);

export default router;
