import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { submitDMCA } from '../controllers/dmcaController.js';

const router = Router();

// DMCA es público pero limitado para evitar abuso
const dmcaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  message: { error: 'Demasiadas solicitudes DMCA desde esta IP, intenta más tarde.' },
});

router.post('/', dmcaLimiter, submitDMCA);

export default router;
