import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import {
  enroll,
  verifyEnroll,
  verify,
  status,
  disable,
  regenerateBackupCodes,
} from '../controllers/twoFactorController.js';

const router = Router();

// Limiter dedicado para verify: previene brute-force del código de 6 dígitos.
// 20 intentos en 15 minutos por IP — suficiente para errores de tipeo,
// insuficiente para un ataque (10⁶ combinaciones, ~700k años a este ritmo).
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiados intentos. Espera unos minutos.' },
});

router.get('/status', authMiddleware, status);
router.post('/enroll', authMiddleware, enroll);
router.post('/verify-enroll', authMiddleware, verifyLimiter, verifyEnroll);
router.post('/verify', authMiddleware, verifyLimiter, verify);
router.post('/regenerate-backup-codes', authMiddleware, verifyLimiter, regenerateBackupCodes);
router.delete('/', authMiddleware, verifyLimiter, disable);

export default router;
