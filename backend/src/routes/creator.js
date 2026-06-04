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
  getAdvancedStats,
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
import {
  getCreatorTipMenu, getMyTipMenu, createTipMenuItem,
  updateTipMenuItem, deleteTipMenuItem, redeemTipMenuItem,
} from '../controllers/tipMenuController.js';
import {
  getCreatorTiers, getMyTiers, createTier,
  updateTier, deleteTier, giftSubscription, getMySubscriptionInfo,
} from '../controllers/tierController.js';

const router = Router();

// Públicas (sin auth)
router.get('/:userId/profile', getPublicCreatorProfile);
router.get('/:userId/galleries', getCreatorGalleries);
router.get('/:userId/tip-menu', getCreatorTipMenu);
router.get('/:userId/tiers',    getCreatorTiers);

router.use(authMiddleware);
// /discover requiere auth para aplicar el age gate correctamente
router.get('/discover', discoverAdultCreators);
router.post('/register', becomeCreator);
router.get('/onboarding-link', getOnboardingLink);
router.get('/dashboard', getCreatorDashboard);
router.get('/earnings', getEarnings);
router.get('/analytics', getAnalytics);
router.get('/advanced-stats', getAdvancedStats);
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

// Tip menu / wishlist
router.get('/tip-menu',          getMyTipMenu);
router.post('/tip-menu',         createTipMenuItem);
router.patch('/tip-menu/:id',    updateTipMenuItem);
router.delete('/tip-menu/:id',   deleteTipMenuItem);
router.post('/tip-menu/:id/redeem', redeemTipMenuItem);
router.get('/analytics/export', exportAnalyticsCsv);

// Tiers (creator-side CRUD)
router.get('/tiers',         getMyTiers);
router.post('/tiers',        createTier);
router.patch('/tiers/:id',   updateTier);
router.delete('/tiers/:id',  deleteTier);

// Subscriptions
router.post('/:creatorId/subscribe', subscribeToCreator);
router.post('/:creatorId/subscribe/confirm', confirmCreatorSubscription);
router.delete('/:creatorId/subscribe', cancelCreatorSubscription);
router.get('/my-subscription/:creatorId', getMySubscriptionInfo);
router.post('/:creatorId/gift-sub', giftSubscription);

export default router;
