import { Router } from 'express';
import { authMiddleware as requireAuth } from '../middleware/auth.js';
import {
  createVideoRequest,
  getReceivedRequests,
  getSentRequests,
  acceptVideoRequest,
  rejectVideoRequest,
  deliverVideoRequest,
  deliverVideoMiddleware,
  cancelVideoRequest,
  listPackages,
  getMyPackages,
  createPackage,
  updatePackage,
  deletePackage,
  updateVideoRequestSettings,
} from '../controllers/videoRequestController.js';

const router = Router();

router.use(requireAuth);

// Packages — el listado público va primero para evitar conflictos
router.get('/my-packages',             getMyPackages);
router.post('/packages',               createPackage);
router.put('/packages/:id',            updatePackage);
router.delete('/packages/:id',         deletePackage);
router.get('/packages/:creatorId',     listPackages);
router.put('/settings',                updateVideoRequestSettings);

// Requests
router.post('/',                       createVideoRequest);
router.get('/received',                getReceivedRequests);
router.get('/sent',                    getSentRequests);
router.put('/:id/accept',              acceptVideoRequest);
router.put('/:id/reject',              rejectVideoRequest);
router.put('/:id/deliver', deliverVideoMiddleware, deliverVideoRequest);
router.post('/:id/cancel',             cancelVideoRequest);

export default router;
