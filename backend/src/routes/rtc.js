import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { initiateCall, rejectCall } from '../controllers/rtcController.js';

const router = Router();
router.use(authMiddleware);

router.post('/call/:matchId/init',   initiateCall);
router.post('/call/:matchId/reject', rejectCall);

export default router;
