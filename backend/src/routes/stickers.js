import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  listPacks, getPack, purchasePack, listMyPacks,
  createPack, uploadStickerItems, stickerUploadMiddleware,
} from '../controllers/stickerController.js';

const router = Router();
router.use(authMiddleware);

router.get('/my', listMyPacks);
router.get('/packs', listPacks);
router.get('/packs/:packId', getPack);
router.post('/packs', createPack);
router.post('/packs/:packId/purchase', purchasePack);
router.post('/packs/:packId/items', stickerUploadMiddleware, uploadStickerItems);

export default router;
