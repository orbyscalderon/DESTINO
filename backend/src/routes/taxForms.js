import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { submitTaxForm, getTaxFormStatus, deleteTaxForm } from '../controllers/taxFormController.js';

const router = Router();

// Rate limit en submit/delete — no en status, que se consulta cada vez que se
// abre la pestaña de pagos. 10 escrituras en 1 hora es generoso (un user razonable
// resubmite 1-2 veces como máximo si se equivoca).
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Espera un poco.' },
});

router.get('/status', authMiddleware, getTaxFormStatus);
router.post('/', authMiddleware, writeLimiter, submitTaxForm);
router.delete('/', authMiddleware, writeLimiter, deleteTaxForm);

export default router;
