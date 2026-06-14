import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireAgeVerified, geoBlockAdult } from '../middleware/adult.js';
import {
  listVideos, getVideoDetail, listTags, listCategories,
  rateVideo, recordView,
} from '../controllers/exploreController.js';
import {
  getMyPlaylists, createPlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, getPlaylistContent,
} from '../controllers/playlistsController.js';
import {
  submit2257, check2257, uploadIdMiddleware,
} from '../controllers/compliance2257Controller.js';

const router = Router();

// Geo-block aplica a TODO acceso al explore (incluso pre-auth para health checks)
router.use(geoBlockAdult);
router.use(authMiddleware);
router.use(requireAgeVerified);

// Catálogo de videos
router.get('/videos',                 listVideos);
router.get('/videos/:id',             getVideoDetail);
router.post('/videos/:id/rate',       rateVideo);
router.post('/videos/:id/view',       recordView);
router.get('/tags',                   listTags);
router.get('/categories',             listCategories);

// Playlists
// NOTE: /playlists/featured es stub vacío hasta que se implemente
// un sistema de featured playlists. Devuelve { playlists: [] } para
// que los megamenús dejen de tirar 404 — degradan a empty state.
router.get('/playlists/featured',     (_req, res) => res.json({ playlists: [] }));
router.get('/playlists',              getMyPlaylists);
router.post('/playlists',             createPlaylist);
router.delete('/playlists/:id',       deletePlaylist);
router.get('/playlists/:id',          getPlaylistContent);
router.post('/playlists/:id/items',   addToPlaylist);
router.delete('/playlists/:id/items/:videoId', removeFromPlaylist);

// 2257 compliance (creadores que suben adult content)
router.post('/2257',                  uploadIdMiddleware, submit2257);
router.get('/2257/check/:videoId',    check2257);

export default router;
