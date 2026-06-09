import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import { enqueueJob, getJobStatus, listQueue } from '../controllers/watermarkController.js';

const router = Router();
router.use(authMiddleware);

router.post('/enqueue',       enqueueJob);
router.get('/status/:jobId',  getJobStatus);

router.use('/admin', isAdmin);
router.get('/admin/queue', listQueue);

export default router;
