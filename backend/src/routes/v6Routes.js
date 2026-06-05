// Aggregator de rutas nuevas (v54-v60) — chat mods, account deletion,
// recurring shows, affiliate, pinned reels.
//
// Se monta en server.js como un solo `app.use(v6Routes)` para no inflar
// el archivo principal con N imports.

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

import chatModRoutes from './chatMod.js';

import {
  requestDeletion, getDeletionStatus, cancelDeletion, exportUserData,
} from '../controllers/accountDeletionController.js';

import {
  createRecurring, listMyRecurring, deleteRecurring, toggleRecurring,
} from '../controllers/recurringShowsController.js';

import {
  enrollAffiliate, getMyAffiliate, attributeCreator,
} from '../controllers/affiliateController.js';

import { togglePinReel, getPinnedReels } from '../controllers/reelsController.js';

const router = Router();

// ── Chat moderation ──
router.use('/api/shows', chatModRoutes);

// ── Account deletion ──
router.post  ('/api/account-deletion',          authMiddleware, requestDeletion);
router.get   ('/api/account-deletion',          authMiddleware, getDeletionStatus);
router.delete('/api/account-deletion',          authMiddleware, cancelDeletion);
router.get   ('/api/account-deletion/export',   authMiddleware, exportUserData);

// ── Recurring shows ──
router.post  ('/api/recurring-shows',     authMiddleware, createRecurring);
router.get   ('/api/recurring-shows',     authMiddleware, listMyRecurring);
router.delete('/api/recurring-shows/:id', authMiddleware, deleteRecurring);
router.patch ('/api/recurring-shows/:id', authMiddleware, toggleRecurring);

// ── Affiliate ──
router.post  ('/api/affiliate/enroll',     authMiddleware, enrollAffiliate);
router.get   ('/api/affiliate/my-program', authMiddleware, getMyAffiliate);
router.post  ('/api/affiliate/attribute',  authMiddleware, attributeCreator);

// ── Pinned reels ──
router.post('/api/reels/:id/pin',           authMiddleware, togglePinReel);
router.get ('/api/reels/pinned/:userId',    authMiddleware, getPinnedReels);

export default router;
