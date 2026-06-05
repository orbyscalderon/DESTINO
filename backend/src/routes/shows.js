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
  uploadRecording,
  uploadRecordingMiddleware,
  getLeaderboard,
  validatePrivateShow,
  privateShowTick,
  requestPrivateShow,
  acceptPrivateShow,
  declinePrivateShow,
  endPrivateShow,
  resetPrivateShow,
  resumePublicShow,
  buyPrivateTicket,
  activatePrivateShow,
  heartbeatShow,
  getTipGoalProgress,
  updateTipGoal,
  setPoll,
  votePoll,
  getPoll,
  getGiftsCatalog,
  getMyGifts,
  createGift,
  updateGift,
  deleteGift,
  getLiveCreators,
  updateShowLive,
  listReplays,
  setGiftGoals,
} from '../controllers/showController.js';
import {
  inviteCoHost, acceptCoHostInvite, declineCoHostInvite,
  removeCoHost, listCoHosts, getMyPendingCoHostInvites,
} from '../controllers/coHostController.js';

const router = Router();
router.use(authMiddleware);

router.get('/', listShows);
router.get('/leaderboard', getLeaderboard);
router.get('/live-creators', getLiveCreators);
router.get('/co-hosts/pending', getMyPendingCoHostInvites);
router.get('/replays', listReplays);
router.get('/my', getMyShows);

// Creator gifts (custom catalog) — antes de :id para evitar conflictos
router.get('/my/gifts', getMyGifts);
router.post('/my/gifts', createGift);
router.put('/my/gifts/:id', updateGift);
router.delete('/my/gifts/:id', deleteGift);
router.get('/host/:hostId/gifts/catalog', getGiftsCatalog);
router.get('/:id', getShow);
router.post('/', createShow);
router.post('/:id/start', startShow);
router.post('/:id/end', endShow);
router.patch('/:id/live-update', updateShowLive);
router.put('/:id/gift-goals',   setGiftGoals);
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
router.patch('/:id/recording',        setRecordingUrl);
router.post('/:id/recording/upload',  uploadRecordingMiddleware, uploadRecording);
router.post('/:id/private/validate',  validatePrivateShow);
router.post('/:id/private/tick',      privateShowTick);
router.post('/:id/private/request',   requestPrivateShow);
router.post('/:id/private/accept',    acceptPrivateShow);
router.post('/:id/private/decline',   declinePrivateShow);
router.post('/:id/private/end',       endPrivateShow);
router.post('/:id/private/reset',     resetPrivateShow);
router.post('/:id/private/resume',    resumePublicShow);
router.post('/:id/private/buy-ticket', buyPrivateTicket);
router.post('/:id/private/activate',  activatePrivateShow);
router.post('/:id/heartbeat',         heartbeatShow);
router.get('/:id/tip-goal',           getTipGoalProgress);
router.patch('/:id/tip-goal',         updateTipGoal);
router.post('/:id/poll',              setPoll);
router.post('/:id/poll/vote',         votePoll);
router.get('/:id/poll',               getPoll);

// Co-hosts (multi-host shows)
router.get('/:id/co-hosts',           listCoHosts);
router.post('/:id/co-hosts/invite',   inviteCoHost);
router.post('/:id/co-hosts/accept',   acceptCoHostInvite);
router.post('/:id/co-hosts/decline',  declineCoHostInvite);
router.delete('/:id/co-hosts/:userId', removeCoHost);

export default router;
