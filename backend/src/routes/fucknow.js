import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import {
  getStatus, publish, update, unpublish,
  getModerationRules, getDirectory,
  getAdminModerationQueue, adminForceUnpublish,
} from '../controllers/fucknowController.js';

const router = Router();

// Rate limit publish/update: 10/min para prevenir spam de moderación
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Esperá un minuto.' },
});

// Rate limit del directory público (sec audit #5) — 60 req/min por user,
// previene scraping del directorio de publishers. Más generoso que writes
// porque la UI puede pedir varias veces al cambiar filtros.
const directoryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Demasiadas requests al directorio. Esperá un minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/status',            authMiddleware, getStatus);
router.get('/directory',         authMiddleware, directoryLimiter, getDirectory);
router.get('/moderation-rules',  authMiddleware, getModerationRules);
router.post('/publish',          authMiddleware, writeLimiter, publish);
router.post('/update',           authMiddleware, writeLimiter, update);
router.delete('/',               authMiddleware, unpublish);

// Admin-only — usa el middleware isAdmin estándar (no email check ad-hoc).
// Sec audit #1: previene inconsistencia + permite multi-admin via env.
router.get('/admin/moderation-queue', authMiddleware, isAdmin, getAdminModerationQueue);
router.post('/admin/force-unpublish', authMiddleware, isAdmin, adminForceUnpublish);

export default router;
