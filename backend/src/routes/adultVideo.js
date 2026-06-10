import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth.js';
import {
  upsertWatchProgress, startNewSession, getResumeInfo, getContinueWatching, removeFromHistory,
} from '../controllers/watchHistoryController.js';
import {
  listComments, listReplies, createComment, updateComment, deleteComment, toggleLike,
} from '../controllers/videoCommentsController.js';
import {
  listByCreator, getSeries, createSeries, addVideoToSeries, removeFromSeries,
  updateSeries, purchaseSeries,
} from '../controllers/videoSeriesController.js';
import {
  tagCostar, respondToTag, listMyPendingTags, listCostarsForVideo, removeTag,
} from '../controllers/videoCostarsController.js';
import {
  listCaptions, addCaption, getJobsStatus,
} from '../controllers/videoProcessingController.js';

const router = Router();

// Comments: pública lectura, autenticado write
router.get('/comments/:video_id',              listComments);
router.get('/comments/:video_id/:comment_id/replies', listReplies);
router.get('/captions/:video_id',              listCaptions);
router.get('/processing/:video_id/status',     getJobsStatus);
router.get('/series/by/:creatorId',            listByCreator);
router.get('/series/s/:id',                    (req, res, next) => { req.user = req.user || {}; next(); }, getSeries);
router.get('/costars/by-video/:videoId',       listCostarsForVideo);

// Autenticado
router.use(authMiddleware);

// Comment writes
const commentLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Demasiados comentarios — espera' } });
router.post('/comments',           commentLimiter, createComment);
router.patch('/comments/:id',      updateComment);
router.delete('/comments/:id',     deleteComment);
router.post('/comments/:id/like',  toggleLike);

// Watch history
router.post('/watch',                          upsertWatchProgress);
router.post('/watch/:video_id/new-session',    startNewSession);
router.get('/watch/continue',                  getContinueWatching);
router.get('/watch/:video_id',                 getResumeInfo);
router.delete('/watch/:video_id',              removeFromHistory);

// Series
const purchaseLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20 });
router.post('/series',                createSeries);
router.post('/series/:id/items',      addVideoToSeries);
router.delete('/series/:id/items/:videoId', removeFromSeries);
router.patch('/series/:id',           updateSeries);
router.post('/series/:id/purchase',   purchaseLimiter, purchaseSeries);

// Costars
router.post('/costars',                       tagCostar);
router.post('/costars/:videoId/confirm',      respondToTag);
router.get('/costars/pending',                listMyPendingTags);
router.delete('/costars/:videoId/:costarId',  removeTag);

// Captions (creator)
router.post('/captions',  addCaption);

export default router;
