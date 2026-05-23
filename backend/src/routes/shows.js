import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  listShows,
  getShow,
  createShow,
  startShow,
  endShow,
  getShowToken,
  purchaseShowTicket,
  confirmShowTicket,
  getMyShows,
  sendTip,
  sendGift,
  getShowTippers,
  toggleInterest,
  checkInterest,
  banUserFromShow,
  unbanUserFromShow,
  setRecordingUrl,
  getLeaderboard,
} from '../controllers/showController.js';

const router = Router();
router.use(authMiddleware);

router.get('/', listShows);
router.get('/leaderboard', getLeaderboard);
router.get('/my', getMyShows);
router.get('/:id', getShow);
router.post('/', createShow);
router.post('/:id/start', startShow);
router.post('/:id/end', endShow);
router.get('/:id/token', getShowToken);
router.post('/:id/ticket', purchaseShowTicket);
router.post('/:id/ticket/confirm', confirmShowTicket);
router.post('/:id/tip',           sendTip);
router.post('/:id/gift',          sendGift);
router.get('/:id/tippers',        getShowTippers);
router.post('/:id/interest',      toggleInterest);
router.get('/:id/interest',       checkInterest);
router.post('/:id/ban/:userId',   banUserFromShow);
router.delete('/:id/ban/:userId', unbanUserFromShow);
router.patch('/:id/recording',    setRecordingUrl);

export default router;
