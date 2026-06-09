import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import { submitNotice, listNotices, processNotice } from '../controllers/dsaController.js';

const router = Router();

// Rate limit por defecto: 10/hora por IP.
// Trusted Flaggers (con header X-Flagger-Key válido) están exentos — DSA Art. 22
// les da priority y volumen distinto.
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas notificaciones DSA desde esta IP, intenta más tarde.' },
  skip: (req) => !!req.headers['x-flagger-key'],
});

router.post('/', submitLimiter, submitNotice);

router.use('/admin', authMiddleware, isAdmin);
router.get('/admin/',     listNotices);
router.patch('/admin/:id', processNotice);

export default router;
