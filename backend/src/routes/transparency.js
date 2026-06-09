import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import {
  listPublishedReports, getPublishedReport,
  generateReport, updateReport, listAllReports,
} from '../controllers/transparencyController.js';

const router = Router();

// Público — reportes publicados
router.get('/',         listPublishedReports);
router.get('/:period',  getPublishedReport);

// Admin
router.use('/admin', authMiddleware, isAdmin);
router.get('/admin/all',          listAllReports);
router.post('/admin/generate',    generateReport);
router.patch('/admin/:period',    updateReport);

export default router;
