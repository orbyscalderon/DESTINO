import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { exportMyData, deleteMyAccount } from '../controllers/gdprController.js';

const router = Router();
router.use(authMiddleware);

router.get('/export',     exportMyData);
router.delete('/account', deleteMyAccount);

export default router;
