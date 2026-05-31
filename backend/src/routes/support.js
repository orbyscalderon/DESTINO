import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { submitTicket, getMyTickets } from '../controllers/supportController.js';

const router = Router();

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiados tickets. Espera 1 hora.' },
});

// Middleware auth opcional: si viene Bearer válido, asigna req.user; si no, sigue sin él.
async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.substring(7) : null;
    if (!token) return next();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) req.user = data.user;
  } catch { /* ignorar y seguir sin auth */ }
  next();
}

router.post('/',     submitLimiter, optionalAuth, submitTicket);
router.get('/my',    authMiddleware, getMyTickets);

export default router;
