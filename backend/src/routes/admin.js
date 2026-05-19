import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getStats, getUsers, setUserPremium, setUserVerified, deleteUser } from '../controllers/adminController.js';

const router = Router();

router.use(authMiddleware);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.patch('/users/premium', setUserPremium);
router.patch('/users/verified', setUserVerified);
router.delete('/users/:userId', deleteUser);

export default router;
