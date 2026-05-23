import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createVideoRequest,
  getReceivedRequests,
  getSentRequests,
  acceptVideoRequest,
  rejectVideoRequest,
  deliverVideoRequest,
  deliverVideoMiddleware,
  cancelVideoRequest,
} from '../controllers/videoRequestController.js';

const router = Router();

router.use(requireAuth);

router.post('/',                       createVideoRequest);
router.get('/received',                getReceivedRequests);
router.get('/sent',                    getSentRequests);
router.put('/:id/accept',              acceptVideoRequest);
router.put('/:id/reject',              rejectVideoRequest);
router.put('/:id/deliver', deliverVideoMiddleware, deliverVideoRequest);
router.post('/:id/cancel',             cancelVideoRequest);

export default router;
