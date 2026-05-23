import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getRtpCapabilities,
  createTransport,
  connectTransport,
  produce,
  consume,
  listProducers,
  initiateCall,
  rejectCall,
  leaveRoom,
} from '../controllers/rtcController.js';

const router = Router();
router.use(authMiddleware);

// Room capabilities + producers
router.get('/rooms/:roomId/capabilities', getRtpCapabilities);
router.get('/rooms/:roomId/producers',    listProducers);

// Transport lifecycle
router.post('/rooms/:roomId/transport',                            createTransport);
router.post('/rooms/:roomId/transport/:transportId/connect',      connectTransport);
router.post('/rooms/:roomId/transport/:transportId/produce',      produce);
router.post('/rooms/:roomId/consume',                             consume);

// Call signaling
router.post('/call/:matchId/init',   initiateCall);
router.post('/call/:matchId/reject', rejectCall);
router.delete('/rooms/:roomId/leave', leaveRoom);

export default router;
