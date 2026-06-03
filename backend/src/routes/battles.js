import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  inviteBattle, acceptBattle, rejectBattle, cancelBattle,
  tipBattle, endBattle, getBattle, getMyPendingBattles,
  getActiveBattleForShow,
} from '../controllers/battlesController.js';

const router = Router();

router.use(authMiddleware);

router.post('/invite', inviteBattle);
router.get('/pending', getMyPendingBattles);
router.get('/active', getActiveBattleForShow);
router.get('/:id', getBattle);
router.post('/:id/accept', acceptBattle);
router.post('/:id/reject', rejectBattle);
router.post('/:id/cancel', cancelBattle);
router.post('/:id/tip', tipBattle);
router.post('/:id/end', endBattle);

export default router;
