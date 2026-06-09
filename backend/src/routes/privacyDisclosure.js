import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isAdmin } from '../middleware/admin.js';
import {
  listSubprocessors, addSubprocessor, updateSubprocessor,
  listProcessingActivities, listCookies,
} from '../controllers/subprocessorController.js';
import { reportBreach, listBreaches, updateBreach, notifyAffectedUsers } from '../controllers/breachController.js';
import { listMyDecisions, adminListDecisions } from '../controllers/moderationDecisionController.js';

const router = Router();

// Públicos
router.get('/subprocessors',          listSubprocessors);
router.get('/processing-activities',  listProcessingActivities);
router.get('/cookies',                listCookies);

// Usuario autenticado — sus decisiones de moderación
router.get('/moderation-decisions/mine', authMiddleware, listMyDecisions);

// Admin
router.use('/admin', authMiddleware, isAdmin);
router.post('/admin/subprocessors',          addSubprocessor);
router.patch('/admin/subprocessors/:id',     updateSubprocessor);
router.get('/admin/breaches',                listBreaches);
router.post('/admin/breaches',               reportBreach);
router.patch('/admin/breaches/:id',          updateBreach);
router.post('/admin/breaches/:id/notify-users', notifyAffectedUsers);
router.get('/admin/moderation-decisions',    adminListDecisions);

export default router;
