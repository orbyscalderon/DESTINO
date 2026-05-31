import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listDrafts, upsertDraft, deleteDraft } from '../controllers/draftsController.js';
import { perUserRateLimit } from '../middleware/userRateLimit.js';

const router = Router();
router.use(authMiddleware);

// Autosave puede ser frecuente — ventana generosa pero por usuario
const draftLimit = perUserRateLimit({ max: 120, perSec: 2, name: 'drafts' });

router.get('/',         listDrafts);
router.put('/',         draftLimit, upsertDraft);
router.delete('/:key',  deleteDraft);

export default router;
