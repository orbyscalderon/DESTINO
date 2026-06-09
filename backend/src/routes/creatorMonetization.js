import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import {
  getMyDmPricing, upsertMyDmPricing, checkDmPricingForFan,
} from '../controllers/dmPricingController.js';
import {
  listMyVault, createVaultItem, deleteVaultItem, markUsed,
  uploadVaultItemMiddleware,
} from '../controllers/vaultController.js';
import {
  listByCreator, getCollection, createCollection, addItem,
  updateCollection, purchaseCollection,
} from '../controllers/photoCollectionsController.js';
import {
  getMyAutoReply, upsertMyAutoReply,
  listQuickReplies, createQuickReply, deleteQuickReply,
  getMyPersona, upsertMyPersona,
  getMyTopFans, getMyFanStatsWith,
  enableSpyMode, startSpySession, payToSkipQueue,
} from '../controllers/creatorAdvancedController.js';
import {
  createPromo, listMyPromos, redeemPromo, togglePromo,
} from '../controllers/promoCodeController.js';
import {
  listMyGeoBlocks, upsertGeoBlock, removeGeoBlock,
} from '../controllers/contentGeoController.js';
import {
  schedulePost, scheduleReel, listMyScheduled, cancelScheduledPost,
} from '../controllers/scheduledContentController.js';

const router = Router();
router.use(authMiddleware);

// Rate limits específicos por endpoint sensible
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 50,
  message: { error: 'Demasiadas subidas al vault por hora' },
});
const purchaseLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  message: { error: 'Demasiadas compras por hora' },
});
const redeemLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  message: { error: 'Demasiados intentos de código por hora — intenta más tarde' },
});

// DM pricing
router.get('/dm-pricing',                getMyDmPricing);
router.put('/dm-pricing',                upsertMyDmPricing);
router.get('/dm-pricing/:creatorId/check', checkDmPricingForFan);

// Vault
router.get('/vault',           listMyVault);
router.post('/vault',          uploadLimiter, uploadVaultItemMiddleware, createVaultItem);
router.delete('/vault/:id',    deleteVaultItem);
router.post('/vault/:id/use',  markUsed);

// Photo collections
router.get('/collections/by/:creatorId', listByCreator);
router.get('/collections/c/:id',         getCollection);
router.post('/collections',              createCollection);
router.post('/collections/:id/items',    addItem);
router.patch('/collections/:id',         updateCollection);
router.post('/collections/:id/purchase', purchaseLimiter, purchaseCollection);

// Auto-reply + quick replies
router.get('/auto-reply',           getMyAutoReply);
router.put('/auto-reply',           upsertMyAutoReply);
router.get('/quick-replies',        listQuickReplies);
router.post('/quick-replies',       createQuickReply);
router.delete('/quick-replies/:id', deleteQuickReply);

// AI persona
router.get('/persona', getMyPersona);
router.put('/persona', upsertMyPersona);

// Fan loyalty
router.get('/top-fans',                getMyTopFans);
router.get('/fan-stats/:creatorId',    getMyFanStatsWith);

// Spy mode + skip queue (showId required)
router.patch('/shows/:showId/spy-mode',        enableSpyMode);
router.post('/shows/:showId/spy-mode/start',   startSpySession);
router.post('/shows/:showId/skip-queue',       payToSkipQueue);

// Promo codes
router.post('/promo-codes',            createPromo);
router.get('/promo-codes/mine',        listMyPromos);
router.post('/promo-codes/redeem',     redeemLimiter, redeemPromo);
router.patch('/promo-codes/:id',       togglePromo);

// Geo-block per content
router.get('/content-geo/mine',        listMyGeoBlocks);
router.put('/content-geo',             upsertGeoBlock);
router.delete('/content-geo/:type/:id', removeGeoBlock);

// Scheduled content
router.patch('/scheduled/post/:id',  schedulePost);
router.patch('/scheduled/reel/:id',  scheduleReel);
router.delete('/scheduled/post/:id', cancelScheduledPost);
router.get('/scheduled/mine',        listMyScheduled);

export default router;
