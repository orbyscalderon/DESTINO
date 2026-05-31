import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  becomeCreator,
  getOnboardingLink,
  getCreatorDashboard,
  getEarnings,
  requestPayout,
  updateCreatorBio,
  getPublicCreatorProfile,
  setSubscriptionPrice,
  subscribeToCreator,
  confirmCreatorSubscription,
  cancelCreatorSubscription,
  getAnalytics,
  getPostAnalytics,
  getEarningsBreakdown,
  getIncomeFeed,
  syncEarnings,
  toggleAdultMode,
  getSubscribers,
  discoverAdultCreators,
  getCreatorGalleries,
  getGalleryItems,
  createGallery,
  addGalleryItem,
  deleteGallery,
  deleteGalleryItem,
  unlockGallery,
  galleryMediaMiddleware,
  sendBroadcast,
  sendBlastEmail,
  exportAnalyticsCsv,
  getStoryAnalytics,
} from '../controllers/creatorController.js';

const router = Router();

// Públicas (sin auth)
router.get('/:userId/profile', getPublicCreatorProfile);
router.get('/:userId/galleries', getCreatorGalleries);

router.use(authMiddleware);
// /discover requiere auth para aplicar el age gate correctamente
router.get('/discover', discoverAdultCreators);
router.post('/register', becomeCreator);
router.get('/onboarding-link', getOnboardingLink);
router.get('/dashboard', getCreatorDashboard);
router.get('/earnings', getEarnings);
router.get('/analytics', getAnalytics);
router.get('/breakdown', getEarningsBreakdown);
router.get('/income-feed', getIncomeFeed);
router.post('/sync-earnings', syncEarnings);
router.get('/post-analytics', getPostAnalytics);
router.get('/story-analytics', getStoryAnalytics);
router.get('/subscribers', getSubscribers);
router.post('/payout', requestPayout);
router.put('/bio', updateCreatorBio);
router.put('/subscription-price', setSubscriptionPrice);
router.put('/adult-mode', toggleAdultMode);

// Galleries
router.post('/galleries', galleryMediaMiddleware, createGallery);
router.get('/galleries/:id/items', getGalleryItems);
router.post('/galleries/:id/items', galleryMediaMiddleware, addGalleryItem);
router.delete('/galleries/:galleryId/items/:itemId', deleteGalleryItem);
router.delete('/galleries/:id', deleteGallery);
router.post('/galleries/:id/unlock', unlockGallery);

// Broadcast & export
router.post('/subscribers/broadcast', sendBroadcast);
router.post('/subscribers/blast-email', sendBlastEmail);
router.get('/analytics/export', exportAnalyticsCsv);

// Subscriptions
router.post('/:creatorId/subscribe', subscribeToCreator);
router.post('/:creatorId/subscribe/confirm', confirmCreatorSubscription);
router.delete('/:creatorId/subscribe', cancelCreatorSubscription);

export default router;
