import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getFeed,
  searchProfiles,
  getTopCreators,
  getGeoIp,
  getProfile,
  updateProfile,
  deleteAccount,
  uploadAvatar,
  uploadMiddleware,
  getPhotos,
  getPhotosForViewer,
  uploadPhoto,
  uploadPhotoMiddleware,
  deletePhoto,
  setPhotoPricing,
  heartbeat,
  reorderPhotos,
  boostProfile,
  toggleIncognito,
  verifyAge,
} from '../controllers/profileController.js';
import {
  uploadProfileVideo,
  uploadVideoMiddleware,
  getProfileVideos,
  deleteProfileVideo,
  setVideoPricing,
  purchaseProfileVideo,
} from '../controllers/profileVideoController.js';

const router = Router();

router.use(authMiddleware);

router.get('/feed', getFeed);
router.get('/search', searchProfiles);
router.get('/top-creators', getTopCreators);
router.post('/heartbeat', heartbeat);
router.delete('/me', deleteAccount);
router.get('/:id/photos', getPhotosForViewer);
router.put('/photos/order', reorderPhotos);
router.put('/photos/:photoId/pricing', setPhotoPricing);
router.post('/boost', boostProfile);
router.put('/incognito', toggleIncognito);
router.post('/verify-age', verifyAge);
router.get('/geoip', getGeoIp);
router.get('/:id', getProfile);
router.put('/:id', updateProfile);
router.post('/avatar', uploadMiddleware, uploadAvatar);
router.post('/photos', uploadPhotoMiddleware, uploadPhoto);
router.delete('/photos/:photoId', deletePhoto);

// Profile videos
router.post('/videos', uploadVideoMiddleware, uploadProfileVideo);
router.get('/:id/videos', getProfileVideos);
router.delete('/videos/:videoId', deleteProfileVideo);
router.put('/videos/:videoId/pricing', setVideoPricing);
router.post('/videos/:videoId/purchase', purchaseProfileVideo);

export default router;
