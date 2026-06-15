import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
  getCompletionStatus,
  claimCompletion,
  toggleHideOnlineStatus,
  pauseAccount,
  unpauseAccount,
  exportData,
  updateLocation,
  setLookingFor,
  setTravelMode,
  clearTravelMode,
  saveSearchPreferences,
  getSearchPreferences,
  uploadSelfieMiddleware,
  verifySelfie,
  getEmailPrefs,
  updateEmailPrefs,
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

// Anti-scraping: limit a /search por usuario autenticado.
// Búsqueda razonable de un humano: ~20 queries / minuto. Bots intentando
// enumerar perfiles típicamente exceden esto rápido.
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Key por user_id (no IP — un mismo IP puede tener varios users legítimos).
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Demasiadas búsquedas. Espera un momento.', code: 'RATE_LIMIT' },
});

// Limit a la enumeración de top creators desde el feed (más permisivo —
// se ve al hacer scroll y refresh; cap general anti-bot).
const enumerationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Demasiadas peticiones. Espera un momento.', code: 'RATE_LIMIT' },
});

router.get('/feed', enumerationLimiter, getFeed);
router.get('/search', searchLimiter, searchProfiles);
router.get('/top-creators', enumerationLimiter, getTopCreators);
router.post('/heartbeat', heartbeat);
router.delete('/me', deleteAccount);
router.post('/boost', boostProfile);
router.put('/incognito', toggleIncognito);
router.put('/hide-online', toggleHideOnlineStatus);
router.post('/pause', pauseAccount);
router.post('/unpause', unpauseAccount);
router.get('/export', exportData);
router.post('/location', updateLocation);
router.put('/looking-for', setLookingFor);
router.post('/travel', setTravelMode);
router.delete('/travel', clearTravelMode);
router.put('/search-preferences', saveSearchPreferences);
router.get('/search-preferences', getSearchPreferences);
router.post('/selfie-verify', uploadSelfieMiddleware, verifySelfie);
router.post('/verify-age', verifyAge);
router.get('/email-prefs',    getEmailPrefs);
router.patch('/email-prefs',  updateEmailPrefs);
router.get('/geoip', getGeoIp);
router.get('/completion/status', getCompletionStatus);
router.post('/completion/claim', claimCompletion);
router.post('/avatar', uploadMiddleware, uploadAvatar);

// Photos
router.post('/photos', uploadPhotoMiddleware, uploadPhoto);
router.put('/photos/order', reorderPhotos);
router.put('/photos/:photoId/pricing', setPhotoPricing);
router.delete('/photos/:photoId', deletePhoto);

// Profile videos (antes del wildcard /:id para evitar conflictos)
router.post('/videos', uploadVideoMiddleware, uploadProfileVideo);
router.delete('/videos/:videoId', deleteProfileVideo);
router.put('/videos/:videoId/pricing', setVideoPricing);
router.post('/videos/:videoId/purchase', purchaseProfileVideo);

// Wildcards al final
router.get('/:id/photos', getPhotosForViewer);
router.get('/:id/videos', getProfileVideos);
router.get('/:id', getProfile);
router.put('/:id', updateProfile);

export default router;
