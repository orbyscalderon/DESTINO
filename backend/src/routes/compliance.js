import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import {
  getPublicConfig, getAllConfig, updateConfig,
} from '../controllers/complianceConfigController.js';

const router = Router();

router.get('/config', getPublicConfig);

router.use('/admin', authMiddleware, isAdmin);
router.get('/admin/config',   getAllConfig);
router.patch('/admin/config', updateConfig);

export default router;
