import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getFeed,
  getProfile,
  updateProfile,
  deleteAccount,
  uploadAvatar,
  uploadMiddleware,
  getPhotos,
  uploadPhoto,
  uploadPhotoMiddleware,
  deletePhoto,
  heartbeat,
} from '../controllers/profileController.js';

const router = Router();

router.use(authMiddleware);

router.get('/feed', getFeed);
router.post('/heartbeat', heartbeat);
router.delete('/me', deleteAccount);
router.get('/:id/photos', getPhotos);
router.get('/:id', getProfile);
router.put('/:id', updateProfile);
router.post('/avatar', uploadMiddleware, uploadAvatar);
router.post('/photos', uploadPhotoMiddleware, uploadPhoto);
router.delete('/photos/:photoId', deletePhoto);

export default router;
